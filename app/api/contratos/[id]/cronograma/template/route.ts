import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import * as XLSX from 'xlsx'

/**
 * GET /api/contratos/[id]/cronograma/template?tipo=fisico|fatdireto
 *
 * Gera e baixa um template .xlsx com:
 *  - Linhas: todos os detalhamentos (nível 3) do contrato, com código + descrição
 *    e colunas auxiliares (grupo, tarefa, peso R$)
 *  - Colunas: meses do contrato (data_inicio → data_fim), cabeçalho 'YYYY-MM-01'
 *  - Valores: pcts atuais (se houver) ou em branco
 *
 * Este mesmo formato é aceito pelo endpoint /upload.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const tipo = url.searchParams.get('tipo') === 'fatdireto' ? 'fatdireto' : 'fisico'
    const admin = createAdminClient()

    const [{ data: contrato }, { data: grupos }, { data: tarefas }, { data: dets }] = await Promise.all([
      admin.from('contratos').select('numero_contrato, data_inicio, data_fim').eq('id', id).single(),
      admin.from('grupos_macro').select('id, codigo, nome, ordem').eq('contrato_id', id).order('ordem'),
      admin.from('tarefas').select('id, grupo_macro_id, codigo, nome, ordem').order('ordem'),
      admin.from('detalhamentos').select('id, tarefa_id, codigo, descricao, quantidade_contratada, valor_material_unit, valor_servico_unit, ordem').order('ordem'),
    ])

    // Ordenação natural por código (1.2.1 < 1.10.1 < 2.1.1).
    // A coluna `ordem` no DB não é confiável entre grupos/tarefas — usamos o
    // próprio código do item para garantir a mesma sequência do cronograma.
    const cmpCodigo = (a: string, b: string) => {
      const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
      const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
      const len = Math.max(pa.length, pb.length)
      for (let i = 0; i < len; i++) {
        const da = pa[i] ?? 0, db = pb[i] ?? 0
        if (da !== db) return da - db
      }
      return 0
    }

    const gruposOrd = [...(grupos || [])].sort((a: any, b: any) => cmpCodigo(a.codigo, b.codigo))
    const grupoIds = new Set(gruposOrd.map((g: any) => g.id))
    const grupoPorId = Object.fromEntries(gruposOrd.map((g: any) => [g.id, g]))
    const ordemGrupo: Record<string, number> = Object.fromEntries(gruposOrd.map((g: any, i: number) => [g.id, i]))

    const tarefasFiltradas = [...(tarefas || [])]
      .filter((t: any) => grupoIds.has(t.grupo_macro_id))
      .sort((a: any, b: any) => {
        const dg = (ordemGrupo[a.grupo_macro_id] ?? 0) - (ordemGrupo[b.grupo_macro_id] ?? 0)
        if (dg !== 0) return dg
        return cmpCodigo(a.codigo, b.codigo)
      })
    const tarefaIds = new Set(tarefasFiltradas.map((t: any) => t.id))
    const tarefaPorId = Object.fromEntries(tarefasFiltradas.map((t: any) => [t.id, t]))
    const ordemTarefa: Record<string, number> = Object.fromEntries(tarefasFiltradas.map((t: any, i: number) => [t.id, i]))

    const detsFiltrados = [...(dets || [])]
      .filter((d: any) => tarefaIds.has(d.tarefa_id))
      .sort((a: any, b: any) => {
        const dt = (ordemTarefa[a.tarefa_id] ?? 0) - (ordemTarefa[b.tarefa_id] ?? 0)
        if (dt !== 0) return dt
        return cmpCodigo(a.codigo, b.codigo)
      })
    const detIds = detsFiltrados.map((d: any) => d.id)

    // Meses do contrato
    const meses: string[] = []
    if (contrato?.data_inicio && contrato?.data_fim) {
      const start = new Date(contrato.data_inicio)
      const end = new Date(contrato.data_fim)
      const cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        meses.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`)
        cur.setMonth(cur.getMonth() + 1)
      }
    }

    // Pcts atuais (para preencher)
    const table = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
    const { data: plans } = detIds.length > 0
      ? await admin.from(table).select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds)
      : { data: [] as any[] } as any
    const pctMap: Record<string, Record<string, number>> = {}
    for (const p of (plans || []) as any[]) {
      const d = p.detalhamento_id, m = String(p.mes).slice(0, 10)
      if (!pctMap[d]) pctMap[d] = {}
      pctMap[d][m] = Number(p.pct_planejado || 0)
    }

    // Monta matriz
    const header = [
      'grupo_codigo', 'grupo_nome',
      'tarefa_codigo', 'tarefa_nome',
      'det_codigo', 'det_descricao',
      'detalhamento_id',   // usado na importação — NÃO apagar
      'peso_R$',           // só informativo
      ...meses,
    ]
    const pesoField: 'valor_servico_unit' | 'valor_material_unit' = tipo === 'fisico' ? 'valor_servico_unit' : 'valor_material_unit'

    const rows: any[][] = [header]
    for (const d of detsFiltrados) {
      const t = tarefaPorId[d.tarefa_id]
      const g = t ? grupoPorId[t.grupo_macro_id] : null
      const peso = Number(d.quantidade_contratada || 0) * Number(d[pesoField] || 0)
      const row: any[] = [
        g?.codigo ?? '', g?.nome ?? '',
        t?.codigo ?? '', t?.nome ?? '',
        d.codigo, d.descricao,
        d.id,
        peso,
        ...meses.map(m => pctMap[d.id]?.[m] ?? ''),
      ]
      rows.push(row)
    }

    // Linha de totais por coluna (fórmula)
    const lastRow = rows.length
    const totalRow: any[] = ['', '', '', '', '', 'TOTAL Σ%', '', '']
    for (let i = 0; i < meses.length; i++) {
      const col = XLSX.utils.encode_col(header.length - meses.length + i)
      totalRow.push({ f: `SUM(${col}2:${col}${lastRow})` })
    }
    rows.push(totalRow)

    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Larguras
    ws['!cols'] = [
      { wch: 10 }, { wch: 28 },
      { wch: 10 }, { wch: 28 },
      { wch: 12 }, { wch: 40 },
      { wch: 38 }, { wch: 12 },
      ...meses.map(() => ({ wch: 10 })),
    ]
    // Freeze first row + first 6 cols
    ws['!freeze'] = { xSplit: 8, ySplit: 1 } as any
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, tipo === 'fisico' ? 'Fisico' : 'FatDireto')

    // Aba de instruções
    const inst = [
      ['INSTRUÇÕES — Cronograma ' + (tipo === 'fisico' ? 'Físico' : 'Fat. Direto')],
      [],
      ['1. Preencha APENAS as colunas de meses (YYYY-MM-01) com o % planejado para cada detalhamento.'],
      ['2. Valores em % (ex.: 12,5 ou 12.5 — pode usar casas decimais).'],
      ['3. Não apague a coluna "detalhamento_id" — ela é usada para identificar cada linha no upload.'],
      ['4. Não renomeie as colunas de cabeçalho.'],
      ['5. Colar direto do Excel é permitido. Mantenha pelo menos uma linha de dados.'],
      ['6. Após preencher, volte para o app e use o botão "Subir planilha" na matriz correspondente.'],
      ['7. A soma de cada linha (Σ%) deve idealmente fechar em 100%. O app alerta quando ≠ 100.'],
      [],
      ['Contrato: ' + (contrato?.numero_contrato ?? id)],
      ['Tipo: ' + (tipo === 'fisico' ? 'Físico (MDO)' : 'Fat. Direto (Material)')],
      ['Gerado em: ' + new Date().toISOString()],
    ]
    const wsInst = XLSX.utils.aoa_to_sheet(inst)
    wsInst['!cols'] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const body = new Uint8Array(buf)
    const filename = `cronograma-${tipo}-${contrato?.numero_contrato ?? id}.xlsx`
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
