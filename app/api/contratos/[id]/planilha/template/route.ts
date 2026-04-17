import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
// xlsx-js-style é um fork do SheetJS que persiste estilos (fill/font/border/numFmt)
// ao escrever. API drop-in compatível com 'xlsx'.
import XLSX from 'xlsx-js-style'

/**
 * GET /api/contratos/[id]/planilha/template?tipo=fisico|fatdireto
 *
 * Gera xlsx idêntico à planilha oficial FIP-WAVE. Dois tipos:
 *
 *   tipo=fisico (default)   → "FÍSICO FINANCEIRO"
 *     11 colunas fixas + meses + TOTAL + detalhamento_id
 *     Percentuais vêm de planejamento_fisico_det
 *
 *   tipo=fatdireto          → "FATURAMENTO DIRETO"
 *     8 colunas fixas (sem PR.UNIT M.O., SUBTOTAL M.O., VALOR GLOBAL)
 *     + meses + TOTAL + detalhamento_id
 *     Percentuais vêm de planejamento_fat_direto_det
 *
 * Formatação preservada:
 *   - Cabeçalho em azul #0070C0, texto branco, altura 28.8 pt
 *   - Linha GERAL (NÍVEL 0) em azul #0070C0, texto branco
 *   - Linhas de grupo (NÍVEL 1) cinza escuro #A6A6A6
 *   - Linhas de tarefa (NÍVEL 2) cinza claro #D9D9D9
 *   - Moeda BR nas colunas de valor · Meses como % (0%) · mmm-yy no header
 *   - Outline levels (agrupamento Excel): grupo level 1, tarefa level 2
 *   - Painel congelado nas 5 primeiras colunas
 *   - Subtotais e rollups por fórmula SUMIFS(NÍVEL=3)
 *
 * O upload (planilha/upload) aceita ambos os arquivos de volta e
 * auto-detecta o tipo pela presença da coluna PR. UNIT M.O.
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

// ── Estilos reutilizados ─────────────────────────────────────────────
const FMT_BRL = '_-"R$"\\ * #,##0.00_-;\\-"R$"\\ * #,##0.00_-;_-"R$"\\ * "-"??_-;_-@_-'
const FMT_PCT = '0%'
const FMT_MES = 'mmm-yy'

const BORDER_THIN = {
  top:    { style: 'thin', color: { rgb: 'B0B0B0' } },
  bottom: { style: 'thin', color: { rgb: 'B0B0B0' } },
  left:   { style: 'thin', color: { rgb: 'B0B0B0' } },
  right:  { style: 'thin', color: { rgb: 'B0B0B0' } },
}

const styleHeader = {
  fill:      { fgColor: { rgb: '0070C0' } },
  font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border:    BORDER_THIN,
}
const styleGeral = {
  fill:      { fgColor: { rgb: '0070C0' } },
  font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  alignment: { vertical: 'center' },
  border:    BORDER_THIN,
}
const styleGrupo = {
  fill:      { fgColor: { rgb: 'A6A6A6' } },
  font:      { bold: true, color: { rgb: '000000' }, sz: 10 },
  alignment: { vertical: 'center' },
  border:    BORDER_THIN,
}
const styleTarefa = {
  fill:      { fgColor: { rgb: 'D9D9D9' } },
  font:      { bold: true, color: { rgb: '000000' }, sz: 10 },
  alignment: { vertical: 'center' },
  border:    BORDER_THIN,
}
const styleDet = {
  font:      { color: { rgb: '000000' }, sz: 10 },
  alignment: { vertical: 'center' },
  border:    BORDER_THIN,
}

function withFmt(base: any, numFmt?: string, extra?: any) {
  return { ...base, ...(numFmt ? { numFmt } : {}), ...(extra || {}) }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const url = new URL(req.url)
    const tipoParam = (url.searchParams.get('tipo') || 'fisico').toLowerCase()
    const tipo: 'fisico' | 'fatdireto' = tipoParam === 'fatdireto' ? 'fatdireto' : 'fisico'
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

    // Pcts da tabela correspondente ao tipo
    const pctTable = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
    const { data: planF } = detIds.length
      ? await admin.from(pctTable).select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds)
      : { data: [] as any[] } as any
    const pctByDet: Record<string, Record<string, number>> = {}
    for (const p of (planF || []) as any[]) {
      const m = String(p.mes).slice(0, 10)
      ;(pctByDet[p.detalhamento_id] ||= {})[m] = Number(p.pct_planejado || 0)
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

    // Layout difere por tipo
    const FIXED = tipo === 'fisico'
      ? [
          'NÍVEL', 'DISCIPLINA', 'ITEM', 'ATIVIDADE INSTALAÇÕES GLOBAL', 'LOCAL',
          'QTDE', 'PR. UNIT MATERIAL', 'SUBTOTAL MATERIAL', 'PR. UNIT M.O.', 'SUBTOTAL\nMÃO DE OBRA', 'VALOR\nGLOBAL',
        ]
      : [
          'NÍVEL', 'DISCIPLINA', 'ITEM', 'ATIVIDADE INSTALAÇÕES GLOBAL', 'LOCAL',
          'QTDE', 'PR. UNIT MATERIAL', 'SUBTOTAL MATERIAL',
        ]
    const mesStartCol = FIXED.length         // 11 (físico) ou 8 (fatdireto)
    const totalColIdx = mesStartCol + meses.length
    const idColIdx    = mesStartCol + meses.length + 1

    // Índices de colunas "moeda" e subtotal para aplicar fórmulas/formatos
    const CURR_COLS = tipo === 'fisico' ? [6, 7, 8, 9, 10] : [6, 7]
    const COL_SUBTOTAL_MAT = 7
    const COL_SUBTOTAL_MO  = 9   // só físico
    const COL_VALOR_GLOBAL = 10  // só físico

    // Construímos como AOA (valores) e guardamos os estilos em paralelo por índice de célula
    const rows: any[][] = []
    const styles: Record<string, any> = {}

    const A = (r: number, c: number) => XLSX.utils.encode_cell({ r, c })
    const colL = (c: number) => XLSX.utils.encode_col(c)

    // ── ROW 0: header ─────────────────────────────────────────────────
    const headerRow: any[] = [
      ...FIXED,
      ...mesesDate, 'TOTAL', 'detalhamento_id',
    ]
    rows.push(headerRow)
    for (let c = 0; c < headerRow.length; c++) {
      const isMes = c >= mesStartCol && c < totalColIdx
      styles[A(0, c)] = withFmt(styleHeader, isMes ? FMT_MES : undefined)
    }

    // Placeholder linha GERAL (row 1)
    const geralRow: any[] = [
      0, 'GERAL', '', '', '',
      ...Array(FIXED.length - 5).fill(''),
      ...meses.map(() => ''), '', '',
    ]
    rows.push(geralRow)
    let excelRow = 3

    const outlineLevels: Record<number, number> = {}

    for (const g of gruposOrd as any[]) {
      const gFirst = excelRow
      const gRowArr: any[] = [
        1, g.disciplina ?? '', g.codigo, g.nome, '',
        ...Array(FIXED.length - 5).fill(''),
        ...meses.map(() => ''), '', '',
      ]
      rows.push(gRowArr)
      const gExcelRow = excelRow
      outlineLevels[gExcelRow - 1] = 1
      for (let c = 0; c < gRowArr.length; c++) {
        const isMes = c >= mesStartCol && c < totalColIdx
        const isCurr = CURR_COLS.includes(c)
        styles[A(gExcelRow - 1, c)] = withFmt(
          styleGrupo,
          isMes || c === totalColIdx ? FMT_PCT : (isCurr ? FMT_BRL : undefined),
          c === 3 ? { font: { ...styleGrupo.font, sz: 10 }, alignment: { ...styleGrupo.alignment, horizontal: 'left' } } : undefined
        )
      }
      excelRow++

      const tarDoGrupo = tarefasOrd.filter((t: any) => t.grupo_macro_id === g.id)
      for (const t of tarDoGrupo as any[]) {
        const tFirst = excelRow
        const tRowArr: any[] = [
          2, t.disciplina ?? g.disciplina ?? '', t.codigo, `. ${t.nome}`, t.local ?? '',
          ...Array(FIXED.length - 5).fill(''),
          ...meses.map(() => ''), '', '',
        ]
        rows.push(tRowArr)
        const tExcelRow = excelRow
        outlineLevels[tExcelRow - 1] = 2
        for (let c = 0; c < tRowArr.length; c++) {
          const isMes = c >= mesStartCol && c < totalColIdx
          const isCurr = CURR_COLS.includes(c)
          styles[A(tExcelRow - 1, c)] = withFmt(
            styleTarefa,
            isMes || c === totalColIdx ? FMT_PCT : (isCurr ? FMT_BRL : undefined),
          )
        }
        excelRow++

        const detsTar = detsOrd.filter((d: any) => d.tarefa_id === t.id)
        for (const d of detsTar as any[]) {
          const qtd = Number(d.quantidade_contratada ?? 0)
          const mat = Number(d.valor_material_unit ?? 0)
          const mo  = Number(d.valor_servico_unit ?? 0)
          const detRowArr: any[] = tipo === 'fisico'
            ? [
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
                  const v = pctByDet[d.id]?.[m]
                  if (v === undefined || v === null) return ''
                  return Number(v) / 100
                }),
                { f: `SUM(${colL(mesStartCol)}${excelRow}:${colL(mesStartCol + meses.length - 1)}${excelRow})` },
                d.id,
              ]
            : [
                3,
                d.disciplina ?? t.disciplina ?? g.disciplina ?? '',
                d.codigo,
                d.descricao,
                d.local ?? t.local ?? '',
                qtd,
                mat,
                { f: `F${excelRow}*G${excelRow}` },
                ...meses.map(m => {
                  const v = pctByDet[d.id]?.[m]
                  if (v === undefined || v === null) return ''
                  return Number(v) / 100
                }),
                { f: `SUM(${colL(mesStartCol)}${excelRow}:${colL(mesStartCol + meses.length - 1)}${excelRow})` },
                d.id,
              ]
          rows.push(detRowArr)
          const detExcelRow = excelRow
          for (let c = 0; c < detRowArr.length; c++) {
            const isMes = c >= mesStartCol && c < totalColIdx
            const isCurr = CURR_COLS.includes(c)
            styles[A(detExcelRow - 1, c)] = withFmt(
              styleDet,
              isMes || c === totalColIdx ? FMT_PCT : (isCurr ? FMT_BRL : undefined),
            )
          }
          excelRow++
        }

        // Rollup na linha-tarefa
        const tLast = excelRow - 1
        const tIdx = tExcelRow - 1
        if (tLast >= tFirst + 1) {
          rows[tIdx][COL_SUBTOTAL_MAT] = { f: `SUMIFS(H${tFirst + 1}:H${tLast},A${tFirst + 1}:A${tLast},3)` }
          if (tipo === 'fisico') {
            rows[tIdx][COL_SUBTOTAL_MO]  = { f: `SUMIFS(J${tFirst + 1}:J${tLast},A${tFirst + 1}:A${tLast},3)` }
            rows[tIdx][COL_VALOR_GLOBAL] = { f: `SUMIFS(K${tFirst + 1}:K${tLast},A${tFirst + 1}:A${tLast},3)` }
          }
        }
      }

      const gLast = excelRow - 1
      const gIdx = gExcelRow - 1
      if (gLast >= gFirst + 1) {
        rows[gIdx][COL_SUBTOTAL_MAT] = { f: `SUMIFS(H${gFirst + 1}:H${gLast},A${gFirst + 1}:A${gLast},3)` }
        if (tipo === 'fisico') {
          rows[gIdx][COL_SUBTOTAL_MO]  = { f: `SUMIFS(J${gFirst + 1}:J${gLast},A${gFirst + 1}:A${gLast},3)` }
          rows[gIdx][COL_VALOR_GLOBAL] = { f: `SUMIFS(K${gFirst + 1}:K${gLast},A${gFirst + 1}:A${gLast},3)` }
        }
      }
    }

    // ── Linha GERAL ────────────────────────────────────────────────────
    const lastDataRow = excelRow - 1
    const weightCol = tipo === 'fisico' ? 'K' : 'H' // VALOR GLOBAL (físico) ou SUBTOTAL MATERIAL (fatdireto)
    if (lastDataRow >= 3) {
      rows[1][COL_SUBTOTAL_MAT] = { f: `SUMIFS(H3:H${lastDataRow},A3:A${lastDataRow},3)` }
      if (tipo === 'fisico') {
        rows[1][COL_SUBTOTAL_MO]  = { f: `SUMIFS(J3:J${lastDataRow},A3:A${lastDataRow},3)` }
        rows[1][COL_VALOR_GLOBAL] = { f: `SUMIFS(K3:K${lastDataRow},A3:A${lastDataRow},3)` }
      }
      for (let mi = 0; mi < meses.length; mi++) {
        const col = colL(mesStartCol + mi)
        rows[1][mesStartCol + mi] = {
          f: `IFERROR(SUMPRODUCT((A3:A${lastDataRow}=3)*(${col}3:${col}${lastDataRow})*(${weightCol}3:${weightCol}${lastDataRow}))/SUMIFS(${weightCol}3:${weightCol}${lastDataRow},A3:A${lastDataRow},3),"")`,
        }
      }
      rows[1][totalColIdx] = { f: `SUM(${colL(mesStartCol)}2:${colL(mesStartCol + meses.length - 1)}2)` }
    }
    for (let c = 0; c < rows[1].length; c++) {
      const isMes = c >= mesStartCol && c < totalColIdx
      const isCurr = CURR_COLS.includes(c)
      styles[A(1, c)] = withFmt(
        styleGeral,
        isMes || c === totalColIdx ? FMT_PCT : (isCurr ? FMT_BRL : undefined),
      )
    }

    // ── Monta worksheet ───────────────────────────────────────────────
    const ws: any = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })

    for (const [addr, st] of Object.entries(styles)) {
      if (ws[addr]) ws[addr].s = st
    }
    for (let mi = 0; mi < meses.length; mi++) {
      const addr = A(0, mesStartCol + mi)
      if (ws[addr]) {
        ws[addr].z = FMT_MES
        ws[addr].s = withFmt(styleHeader, FMT_MES)
      }
    }

    // Larguras
    const colsFisico = [
      { wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 60 }, { wch: 12 },
      { wch: 12 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 16 },
    ]
    const colsFat = [
      { wch: 6 }, { wch: 16 }, { wch: 8 }, { wch: 60 }, { wch: 12 },
      { wch: 12 }, { wch: 17 }, { wch: 17 },
    ]
    ws['!cols'] = [
      ...(tipo === 'fisico' ? colsFisico : colsFat),
      ...meses.map(() => ({ wch: 10 })),
      { wch: 10 },
      { wch: 38, hidden: true },
    ]

    const rowsInfo: any[] = []
    rowsInfo[0] = { hpt: 28.8 }
    for (const [idxStr, level] of Object.entries(outlineLevels)) {
      const idx = Number(idxStr)
      rowsInfo[idx] = { ...(rowsInfo[idx] || {}), level }
    }
    ws['!rows'] = rowsInfo

    ws['!freeze'] = { xSplit: 5, ySplit: 1 } as any
    ws['!views']  = [{ state: 'frozen', xSplit: 5, ySplit: 1 }]
    ;(ws as any)['!outline'] = { summaryBelow: false, summaryRight: false }

    const sheetName = tipo === 'fisico' ? 'FÍSICO FINANCEIRO' : 'FATURAMENTO DIRETO'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
    const body = new Uint8Array(buf)
    const prefix = tipo === 'fisico' ? 'Cronograma Fisico Financeiro' : 'Cronograma Faturamento Direto'
    const filename = `${prefix} - ${contrato?.numero_contrato ?? id}.xlsx`
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
