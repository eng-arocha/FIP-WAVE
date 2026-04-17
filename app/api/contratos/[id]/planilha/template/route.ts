import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import * as XLSX from 'xlsx'

/**
 * GET /api/contratos/[id]/planilha/template
 *
 * Gera um .xlsx idêntico à planilha oficial FIP-WAVE
 * (`Cronograma Físico Financeiro WAVE  Ajustes - CONTRATO.xlsx`):
 *
 *   Aba única: FÍSICO FINANCEIRO
 *   Colunas fixas A..K:
 *     A  NÍVEL (0 geral / 1 grupo / 2 tarefa / 3 detalhamento)
 *     B  DISCIPLINA
 *     C  ITEM         (código: 1, 1.1, 1.1.1)
 *     D  ATIVIDADE INSTALAÇÕES GLOBAL
 *     E  LOCAL
 *     F  QTDE
 *     G  PR. UNIT MATERIAL
 *     H  SUBTOTAL MATERIAL   (fórmula F*G)
 *     I  PR. UNIT M.O.
 *     J  SUBTOTAL MÃO DE OBRA (fórmula F*I)
 *     K  VALOR GLOBAL        (fórmula H+J)
 *   Colunas L..: meses (cabeçalho = data real, um por mês do contrato) com %
 *                planejado expresso como decimal (0.08 = 8 %), só preenchido
 *                nas linhas de nível 3.
 *   Penúltima: TOTAL        (fórmula SUM dos meses, Σ% da linha)
 *   Última (oculta): detalhamento_id — chave técnica usada no upload.
 *
 * Upload aceita o mesmo formato em /api/contratos/[id]/planilha/upload.
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
      admin.from('grupos_macro').select('id, codigo, nome, disciplina').eq('contrato_id', id),
      admin.from('tarefas').select('id, grupo_macro_id, codigo, nome, local, disciplina'),
      admin.from('detalhamentos').select('id, tarefa_id, codigo, descricao, unidade, local, disciplina, quantidade_contratada, valor_material_unit, valor_servico_unit'),
    ])

    const gruposOrd = [...(grupos || [])].sort((a: any, b: any) => cmpCodigo(a.codigo, b.codigo))
    const grupoIds = new Set(gruposOrd.map((g: any) => g.id))
    const ordemGrupo: Record<string, number> = Object.fromEntries(gruposOrd.map((g: any, i: number) => [g.id, i]))

    const tarefasOrd = [...(tarefas || [])]
      .filter((t: any) => grupoIds.has(t.grupo_macro_id))
      .sort((a: any, b: any) => {
        const dg = (ordemGrupo[a.grupo_macro_id] ?? 0) - (ordemGrupo[b.grupo_macro_id] ?? 0)
        if (dg !== 0) return dg
        return cmpCodigo(a.codigo, b.codigo)
      })
    const tarefaIds = new Set(tarefasOrd.map((t: any) => t.id))
    const ordemTarefa: Record<string, number> = Object.fromEntries(tarefasOrd.map((t: any, i: number) => [t.id, i]))

    const detsOrd = [...(dets || [])]
      .filter((d: any) => tarefaIds.has(d.tarefa_id))
      .sort((a: any, b: any) => {
        const dt = (ordemTarefa[a.tarefa_id] ?? 0) - (ordemTarefa[b.tarefa_id] ?? 0)
        if (dt !== 0) return dt
        return cmpCodigo(a.codigo, b.codigo)
      })
    const detIds = detsOrd.map((d: any) => d.id)

    // Pcts atuais (físico) — usados para pré-preencher
    const { data: planF } = detIds.length
      ? await admin.from('planejamento_fisico_det').select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds)
      : { data: [] as any[] } as any
    const pctFis: Record<string, Record<string, number>> = {}
    for (const p of (planF || []) as any[]) {
      const m = String(p.mes).slice(0, 10)
      ;(pctFis[p.detalhamento_id] ||= {})[m] = Number(p.pct_planejado || 0)
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
    const mesesDate = meses.map(m => {
      const [y, mo, d] = m.split('-').map(Number)
      return new Date(Date.UTC(y, mo - 1, d))
    })

    // Linha 1: cabeçalho
    const FIXED = [
      'NÍVEL', 'DISCIPLINA', 'ITEM', 'ATIVIDADE INSTALAÇÕES GLOBAL', 'LOCAL',
      'QTDE', 'PR. UNIT MATERIAL', 'SUBTOTAL MATERIAL', 'PR. UNIT M.O.', 'SUBTOTAL MÃO DE OBRA', 'VALOR GLOBAL',
    ]
    const header: any[] = [...FIXED, ...mesesDate, 'TOTAL', 'detalhamento_id']

    const rows: any[][] = [header]

    // ── Linha GERAL (NÍVEL 0) ─────────────────────────────────────────
    const geralRow: any[] = [0, 'GERAL', '', '', '', '', '', '', '', '', '']
    // Placeholder — fórmulas de coluna preenchidas depois (quando soubermos last row)
    rows.push(geralRow)

    // ── Emite linhas (grupo / tarefa / det) ───────────────────────────
    // 11 colunas fixas; meses começam em col index 11 (L)
    const mesStartCol = FIXED.length // 11

    // Função utilitária para coluna Excel
    const colLetter = (i: number) => XLSX.utils.encode_col(i)
    const kmCol = colLetter(mesStartCol + meses.length) // coluna TOTAL
    const idCol = colLetter(mesStartCol + meses.length + 1) // coluna detalhamento_id

    // Guardamos ranges de linhas por grupo/tarefa para as fórmulas de rollup
    const grupoRange: Record<string, { first: number; last: number }> = {}
    const tarefaRange: Record<string, { first: number; last: number }> = {}

    let excelRow = rows.length + 1 // próxima linha física no Excel (1-indexed)
    // Nota: `rows` já tem 2 entries (header + geral). excelRow = 3 aqui.

    for (const g of gruposOrd as any[]) {
      const gFirst = excelRow
      const gRow: any[] = [
        1, g.disciplina ?? '', g.codigo, g.nome, '',
        '', '', '', '', '', '',
        ...meses.map(() => ''), '', '',
      ]
      rows.push(gRow)
      const gExcelRow = excelRow
      excelRow++

      const tarDoGrupo = tarefasOrd.filter((t: any) => t.grupo_macro_id === g.id)
      for (const t of tarDoGrupo as any[]) {
        const tFirst = excelRow
        const tRow: any[] = [
          2, t.disciplina ?? g.disciplina ?? '', t.codigo, `. ${t.nome}`, t.local ?? '',
          '', '', '', '', '', '',
          ...meses.map(() => ''), '', '',
        ]
        rows.push(tRow)
        const tExcelRow = excelRow
        excelRow++

        const detsTar = detsOrd.filter((d: any) => d.tarefa_id === t.id)
        for (const d of detsTar as any[]) {
          const qtd = Number(d.quantidade_contratada ?? 0)
          const mat = Number(d.valor_material_unit ?? 0)
          const mo  = Number(d.valor_servico_unit ?? 0)
          const detRow: any[] = [
            3,
            d.disciplina ?? t.disciplina ?? g.disciplina ?? '',
            d.codigo,
            d.descricao,
            d.local ?? t.local ?? '',
            qtd,
            mat,
            { f: `F${excelRow}*G${excelRow}` },
            mo,
            { f: `F${excelRow}*I${excelRow}` },
            { f: `H${excelRow}+J${excelRow}` },
            ...meses.map(m => {
              const v = pctFis[d.id]?.[m]
              if (v === undefined || v === null) return ''
              // armazenado como %, exibir como decimal (÷100) para bater com formato oficial
              return Number(v) / 100
            }),
            { f: `SUM(${colLetter(mesStartCol)}${excelRow}:${colLetter(mesStartCol + meses.length - 1)}${excelRow})` },
            d.id,
          ]
          rows.push(detRow)
          excelRow++
        }

        const tLast = excelRow - 1
        tarefaRange[t.id] = { first: tFirst, last: tLast }

        // Após emitir dets, injeta fórmulas de rollup na linha-tarefa
        const tarefaExcelIdx = tExcelRow - 1 // index no array rows
        const tarefaRowArr = rows[tarefaExcelIdx]
        // SUBTOTAL MATERIAL / SUBTOTAL MO / VALOR GLOBAL por SUM (todas linhas filhas nível 3)
        if (tLast >= tFirst + 1) {
          tarefaRowArr[5] = { f: `SUMIFS(F${tFirst + 1}:F${tLast},A${tFirst + 1}:A${tLast},3)` } // QTDE: apenas informativo (não é realmente soma)
          tarefaRowArr[5] = ''
          tarefaRowArr[7] = { f: `SUMIFS(H${tFirst + 1}:H${tLast},A${tFirst + 1}:A${tLast},3)` }
          tarefaRowArr[9] = { f: `SUMIFS(J${tFirst + 1}:J${tLast},A${tFirst + 1}:A${tLast},3)` }
          tarefaRowArr[10] = { f: `SUMIFS(K${tFirst + 1}:K${tLast},A${tFirst + 1}:A${tLast},3)` }
          // Rollup mês-a-mês: ponderado pelo peso de cada det (fisíco = PR.MO × QTDE).
          // Para simplicidade deixamos em branco nas linhas-mãe (app calcula).
        }
      }

      const gLast = excelRow - 1
      grupoRange[g.id] = { first: gFirst, last: gLast }
      const grupoArrIdx = gExcelRow - 1
      const grArr = rows[grupoArrIdx]
      if (gLast >= gFirst + 1) {
        grArr[7]  = { f: `SUMIFS(H${gFirst + 1}:H${gLast},A${gFirst + 1}:A${gLast},3)` }
        grArr[9]  = { f: `SUMIFS(J${gFirst + 1}:J${gLast},A${gFirst + 1}:A${gLast},3)` }
        grArr[10] = { f: `SUMIFS(K${gFirst + 1}:K${gLast},A${gFirst + 1}:A${gLast},3)` }
      }
    }

    // ── Atualiza linha GERAL (row 2 do Excel, index 1 em `rows`) ──────
    const lastDataRow = excelRow - 1 // última linha com conteúdo
    const geralArr = rows[1]
    geralArr[7]  = { f: `SUMIFS(H3:H${lastDataRow},A3:A${lastDataRow},3)` }
    geralArr[9]  = { f: `SUMIFS(J3:J${lastDataRow},A3:A${lastDataRow},3)` }
    geralArr[10] = { f: `SUMIFS(K3:K${lastDataRow},A3:A${lastDataRow},3)` }
    // Rollup ponderado dos meses na linha GERAL (só ilustrativo;
    // fórmula de exemplo: SUMPRODUCT(col_mes * peso) / SUM(peso))
    for (let mi = 0; mi < meses.length; mi++) {
      const col = colLetter(mesStartCol + mi)
      geralArr[mesStartCol + mi] = {
        f: `SUMPRODUCT((A3:A${lastDataRow}=3)*(${col}3:${col}${lastDataRow})*(K3:K${lastDataRow}))/SUMIFS(K3:K${lastDataRow},A3:A${lastDataRow},3)`,
      }
    }
    // TOTAL da linha GERAL
    geralArr[mesStartCol + meses.length] = {
      f: `SUM(${colLetter(mesStartCol)}2:${colLetter(mesStartCol + meses.length - 1)}2)`,
    }

    // ── Monta a planilha ──────────────────────────────────────────────
    const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })
    ws['!cols'] = [
      { wch: 6 },   // NÍVEL
      { wch: 14 },  // DISCIPLINA
      { wch: 10 },  // ITEM
      { wch: 48 },  // ATIVIDADE
      { wch: 14 },  // LOCAL
      { wch: 8 },   // QTDE
      { wch: 14 },  // PR.UNIT MATERIAL
      { wch: 14 },  // SUBTOTAL MATERIAL
      { wch: 14 },  // PR.UNIT M.O.
      { wch: 14 },  // SUBTOTAL M.O.
      { wch: 14 },  // VALOR GLOBAL
      ...meses.map(() => ({ wch: 10 })),
      { wch: 10 },  // TOTAL
      { wch: 38, hidden: true }, // detalhamento_id
    ]
    ws['!freeze'] = { xSplit: 5, ySplit: 1 } as any

    // Formata cabeçalho de meses como data curta
    for (let mi = 0; mi < meses.length; mi++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: mesStartCol + mi })
      if (ws[addr]) ws[addr].z = 'mmm/yy'
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FÍSICO FINANCEIRO')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const body = new Uint8Array(buf)
    const filename = `Cronograma Fisico Financeiro - ${contrato?.numero_contrato ?? id}.xlsx`
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
