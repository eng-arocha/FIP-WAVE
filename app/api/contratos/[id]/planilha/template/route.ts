import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import * as XLSX from 'xlsx'

/**
 * GET /api/contratos/[id]/planilha/template
 *
 * Planilha unificada com 3 abas:
 *   - Orcamento  → Qtde / PR. Mat / PR. M.O. (8 colunas oficiais)
 *   - Fisico     → % planejado por mês (curva físico / MDO)
 *   - FatDireto  → % planejado por mês (curva fat. direto / material)
 *
 * Cada aba tem primeiro 'Cód.' e ao final 'detalhamento_id' (oculta) — mesmo
 * match para todas. O upload aceita qualquer subset das abas.
 *
 * Ordenação natural por código em todos os três níveis (1.2 < 1.10 < 2.1).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function cmpCodigo(a: string, b: string) {
  const pa = String(a || '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b || '').split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0, db = pb[i] ?? 0
    if (da !== db) return da - db
  }
  return 0
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const [{ data: contrato }, { data: grupos }, { data: tarefas }, { data: dets }] = await Promise.all([
      admin.from('contratos').select('numero_contrato, data_inicio, data_fim').eq('id', id).single(),
      admin.from('grupos_macro').select('id, codigo, nome').eq('contrato_id', id),
      admin.from('tarefas').select('id, grupo_macro_id, codigo, nome'),
      admin.from('detalhamentos').select('id, tarefa_id, codigo, descricao, unidade, local, quantidade_contratada, valor_material_unit, valor_servico_unit'),
    ])

    const gruposOrd = [...(grupos || [])].sort((a: any, b: any) => cmpCodigo(a.codigo, b.codigo))
    const grupoIds = new Set(gruposOrd.map((g: any) => g.id))
    const grupoPorId = Object.fromEntries(gruposOrd.map((g: any) => [g.id, g]))
    const ordemGrupo: Record<string, number> = Object.fromEntries(gruposOrd.map((g: any, i: number) => [g.id, i]))

    const tarefasOrd = [...(tarefas || [])]
      .filter((t: any) => grupoIds.has(t.grupo_macro_id))
      .sort((a: any, b: any) => {
        const dg = (ordemGrupo[a.grupo_macro_id] ?? 0) - (ordemGrupo[b.grupo_macro_id] ?? 0)
        if (dg !== 0) return dg
        return cmpCodigo(a.codigo, b.codigo)
      })
    const tarefaIds = new Set(tarefasOrd.map((t: any) => t.id))
    const tarefaPorId = Object.fromEntries(tarefasOrd.map((t: any) => [t.id, t]))
    const ordemTarefa: Record<string, number> = Object.fromEntries(tarefasOrd.map((t: any, i: number) => [t.id, i]))

    const detsOrd = [...(dets || [])]
      .filter((d: any) => tarefaIds.has(d.tarefa_id))
      .sort((a: any, b: any) => {
        const dt = (ordemTarefa[a.tarefa_id] ?? 0) - (ordemTarefa[b.tarefa_id] ?? 0)
        if (dt !== 0) return dt
        return cmpCodigo(a.codigo, b.codigo)
      })
    const detIds = detsOrd.map((d: any) => d.id)

    // Carrega pcts atuais para pré-preencher
    const [{ data: planF }, { data: planD }] = await Promise.all([
      detIds.length ? admin.from('planejamento_fisico_det').select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds) : Promise.resolve({ data: [] as any[] } as any),
      detIds.length ? admin.from('planejamento_fat_direto_det').select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds) : Promise.resolve({ data: [] as any[] } as any),
    ])
    const pctFis: Record<string, Record<string, number>> = {}
    for (const p of (planF || []) as any[]) {
      const m = String(p.mes).slice(0, 10)
      ;(pctFis[p.detalhamento_id] ||= {})[m] = Number(p.pct_planejado || 0)
    }
    const pctFat: Record<string, Record<string, number>> = {}
    for (const p of (planD || []) as any[]) {
      const m = String(p.mes).slice(0, 10)
      ;(pctFat[p.detalhamento_id] ||= {})[m] = Number(p.pct_planejado || 0)
    }

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

    const wb = XLSX.utils.book_new()

    // ═══════════════════════════════════════════════════
    // ABA 1 — ORCAMENTO (8 colunas oficiais)
    // ═══════════════════════════════════════════════════
    const rowsO: any[][] = []
    rowsO.push([
      'Cód.', 'Descrição', 'Local', 'Qtde', 'Unid',
      'PR. Mat', 'PR. M.O.', 'Total',
      'detalhamento_id',
    ])
    let excelRow = 2
    for (const g of gruposOrd as any[]) {
      rowsO.push([g.codigo, g.nome, '', '', '', '', '', '', ''])
      excelRow++
      const tarDoGrupo = tarefasOrd.filter((t: any) => t.grupo_macro_id === g.id)
      for (const t of tarDoGrupo as any[]) {
        rowsO.push([t.codigo, t.nome, '', '', '', '', '', '', ''])
        excelRow++
        const detsTar = detsOrd.filter((d: any) => d.tarefa_id === t.id)
        for (const d of detsTar as any[]) {
          rowsO.push([
            d.codigo, d.descricao, d.local ?? '',
            Number(d.quantidade_contratada ?? 0),
            d.unidade ?? 'UN',
            Number(d.valor_material_unit ?? 0),
            Number(d.valor_servico_unit ?? 0),
            { f: `D${excelRow}*(F${excelRow}+G${excelRow})` },
            d.id,
          ])
          excelRow++
        }
      }
    }
    const lastO = rowsO.length
    rowsO.push(['', 'TOTAL GERAL', '', '', '', '', '', { f: `SUM(H2:H${lastO})` }, ''])
    const wsO = XLSX.utils.aoa_to_sheet(rowsO)
    wsO['!cols'] = [
      { wch: 10 }, { wch: 44 }, { wch: 18 }, { wch: 10 }, { wch: 6 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 38, hidden: true },
    ]
    wsO['!freeze'] = { xSplit: 2, ySplit: 1 } as any
    XLSX.utils.book_append_sheet(wb, wsO, 'Orcamento')

    // ═══════════════════════════════════════════════════
    // ABA 2 — FISICO (curva físico, % por mês)
    // ═══════════════════════════════════════════════════
    const buildMatriz = (pctMap: Record<string, Record<string, number>>) => {
      const head = ['Cód.', 'Descrição', 'detalhamento_id', ...meses]
      const rows: any[][] = [head]
      for (const d of detsOrd as any[]) {
        rows.push([
          d.codigo, d.descricao, d.id,
          ...meses.map(m => pctMap[d.id]?.[m] ?? ''),
        ])
      }
      const last = rows.length
      const totalRow: any[] = ['', 'TOTAL Σ%', '']
      for (let i = 0; i < meses.length; i++) {
        const col = XLSX.utils.encode_col(3 + i)
        totalRow.push({ f: `SUM(${col}2:${col}${last})` })
      }
      rows.push(totalRow)
      return rows
    }

    const rowsF = buildMatriz(pctFis)
    const wsF = XLSX.utils.aoa_to_sheet(rowsF)
    wsF['!cols'] = [
      { wch: 10 }, { wch: 42 }, { wch: 38, hidden: true },
      ...meses.map(() => ({ wch: 10 })),
    ]
    wsF['!freeze'] = { xSplit: 2, ySplit: 1 } as any
    XLSX.utils.book_append_sheet(wb, wsF, 'Fisico')

    // ═══════════════════════════════════════════════════
    // ABA 3 — FAT DIRETO
    // ═══════════════════════════════════════════════════
    const rowsD = buildMatriz(pctFat)
    const wsD = XLSX.utils.aoa_to_sheet(rowsD)
    wsD['!cols'] = [
      { wch: 10 }, { wch: 42 }, { wch: 38, hidden: true },
      ...meses.map(() => ({ wch: 10 })),
    ]
    wsD['!freeze'] = { xSplit: 2, ySplit: 1 } as any
    XLSX.utils.book_append_sheet(wb, wsD, 'FatDireto')

    // ═══════════════════════════════════════════════════
    // ABA 4 — INSTRUÇÕES
    // ═══════════════════════════════════════════════════
    const inst = [
      ['PLANILHA UNIFICADA — Orçamento + Cronograma Físico + Fat. Direto'],
      [],
      ['Esta planilha tem 3 abas que são processadas JUNTAS pelo upload:'],
      [],
      ['  Orcamento  → Qtde, PR. Mat e PR. M.O. (reajuste de preços)'],
      ['  Fisico     → % planejado por mês (curva MDO)'],
      ['  FatDireto  → % planejado por mês (curva material/fat. direto)'],
      [],
      ['REGRAS GERAIS'],
      ['  1. Primeira linha de cada aba = cabeçalho. NÃO renomeie.'],
      ['  2. A coluna detalhamento_id identifica cada linha — fica OCULTA; não apague.'],
      ['  3. Linhas sem detalhamento_id (grupos/tarefas/total) são IGNORADAS — pode mexer à vontade.'],
      ['  4. Pode subir a planilha em qualquer uma das páginas (Estrutura ou Cronograma) —'],
      ['     sempre atualiza orçamento + físico + fat direto juntos.'],
      [],
      ['EDITAR SÓ UMA ABA?'],
      ['  Basta apagar o conteúdo das outras — o upload só atualiza o que tiver valor.'],
      [],
      ['REAJUSTE +10%'],
      ['  Na aba Orcamento: digite 1,10 em qualquer célula, copie, selecione a coluna'],
      ['  PR. Mat, menu "Colar especial → Multiplicar". Repita para PR. M.O.'],
      [],
      ['Contrato: ' + (contrato?.numero_contrato ?? id)],
      ['Gerado em: ' + new Date().toISOString()],
    ]
    const wsInst = XLSX.utils.aoa_to_sheet(inst)
    wsInst['!cols'] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const body = new Uint8Array(buf)
    const filename = `planilha-${contrato?.numero_contrato ?? id}.xlsx`
    return new Response(body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
