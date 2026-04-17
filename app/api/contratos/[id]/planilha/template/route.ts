import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
// xlsx-js-style é um fork do SheetJS que persiste estilos (fill/font/border/numFmt)
// ao escrever. API drop-in compatível com 'xlsx'.
import XLSX from 'xlsx-js-style'

/**
 * GET /api/contratos/[id]/planilha/template
 *
 * Gera xlsx idêntico à planilha oficial FIP-WAVE
 * (`docs/Cronograma Físico Financeiro WAVE  Ajustes - CONTRATO.xlsx`):
 *
 *   Aba 'FÍSICO FINANCEIRO' com 11 colunas fixas + N meses + TOTAL +
 *   detalhamento_id (oculta).
 *
 * Formatação preservada:
 *   - Cabeçalho em azul #0070C0, texto branco, altura 28.8 pt
 *   - Linha GERAL (NÍVEL 0) em azul #0070C0, texto branco
 *   - Linhas de grupo (NÍVEL 1) cinza escuro #A6A6A6
 *   - Linhas de tarefa (NÍVEL 2) cinza claro #D9D9D9
 *   - Moeda BR em PR.Mat, SUBTOTAL MATERIAL, PR.MO, SUBTOTAL MO, VALOR GLOBAL
 *   - Meses como % (0%) · cabeçalho formato mmm-yy
 *   - Outline levels (agrupamento Excel): grupo level 1, tarefa level 2
 *   - Painel congelado nas 5 primeiras colunas
 *   - Subtotais e rollups por fórmula SUMIFS(NÍVEL=3)
 *
 * O upload (planilha/upload) aceita este mesmo arquivo de volta.
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

    // Pcts atuais (usamos apenas físico; fat direto compartilha no upload)
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

    const FIXED = [
      'NÍVEL', 'DISCIPLINA', 'ITEM', 'ATIVIDADE INSTALAÇÕES GLOBAL', 'LOCAL',
      'QTDE', 'PR. UNIT MATERIAL', 'SUBTOTAL MATERIAL', 'PR. UNIT M.O.', 'SUBTOTAL\nMÃO DE OBRA', 'VALOR\nGLOBAL',
    ]
    const mesStartCol = FIXED.length // 11
    const totalColIdx = mesStartCol + meses.length
    const idColIdx    = mesStartCol + meses.length + 1

    // Construímos como AOA (valores) e guardamos os estilos em paralelo por índice de célula
    const rows: any[][] = []
    const styles: Record<string, any> = {} // cellAddr → style obj

    // Helper p/ endereço
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

    // Placeholder linha GERAL (row 1) — preenchemos fórmulas depois
    const geralRow: any[] = [0, 'GERAL', '', '', '', '', '', '', '', '', '', ...meses.map(() => ''), '', '']
    rows.push(geralRow)
    let excelRow = 3 // próxima linha física no Excel

    // Para outline (agrupamento por nível Excel)
    const outlineLevels: Record<number, number> = {}

    for (const g of gruposOrd as any[]) {
      const gFirst = excelRow
      const gRowArr: any[] = [
        1, g.disciplina ?? '', g.codigo, g.nome, '',
        '', '', '', '', '', '',
        ...meses.map(() => ''), '', '',
      ]
      rows.push(gRowArr)
      const gExcelRow = excelRow
      outlineLevels[gExcelRow - 1] = 1 // row index 0-based no Excel 'rows' array
      // Aplica estilo da linha grupo
      for (let c = 0; c < gRowArr.length; c++) {
        const isMes = c >= mesStartCol && c < totalColIdx
        const isCurr = c === 6 || c === 7 || c === 8 || c === 9 || c === 10
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
          '', '', '', '', '', '',
          ...meses.map(() => ''), '', '',
        ]
        rows.push(tRowArr)
        const tExcelRow = excelRow
        outlineLevels[tExcelRow - 1] = 2
        for (let c = 0; c < tRowArr.length; c++) {
          const isMes = c >= mesStartCol && c < totalColIdx
          const isCurr = c === 6 || c === 7 || c === 8 || c === 9 || c === 10
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
          const detRowArr: any[] = [
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
              return Number(v) / 100
            }),
            { f: `SUM(${colL(mesStartCol)}${excelRow}:${colL(mesStartCol + meses.length - 1)}${excelRow})` },
            d.id,
          ]
          rows.push(detRowArr)
          const detExcelRow = excelRow
          for (let c = 0; c < detRowArr.length; c++) {
            const isMes = c >= mesStartCol && c < totalColIdx
            const isCurr = c === 6 || c === 7 || c === 8 || c === 9 || c === 10
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
          rows[tIdx][7]  = { f: `SUMIFS(H${tFirst + 1}:H${tLast},A${tFirst + 1}:A${tLast},3)` }
          rows[tIdx][9]  = { f: `SUMIFS(J${tFirst + 1}:J${tLast},A${tFirst + 1}:A${tLast},3)` }
          rows[tIdx][10] = { f: `SUMIFS(K${tFirst + 1}:K${tLast},A${tFirst + 1}:A${tLast},3)` }
        }
      }

      const gLast = excelRow - 1
      const gIdx = gExcelRow - 1
      if (gLast >= gFirst + 1) {
        rows[gIdx][7]  = { f: `SUMIFS(H${gFirst + 1}:H${gLast},A${gFirst + 1}:A${gLast},3)` }
        rows[gIdx][9]  = { f: `SUMIFS(J${gFirst + 1}:J${gLast},A${gFirst + 1}:A${gLast},3)` }
        rows[gIdx][10] = { f: `SUMIFS(K${gFirst + 1}:K${gLast},A${gFirst + 1}:A${gLast},3)` }
      }
    }

    // ── Linha GERAL (row 1 do Excel, idx 1 em rows) ────────────────────
    const lastDataRow = excelRow - 1
    if (lastDataRow >= 3) {
      rows[1][7]  = { f: `SUMIFS(H3:H${lastDataRow},A3:A${lastDataRow},3)` }
      rows[1][9]  = { f: `SUMIFS(J3:J${lastDataRow},A3:A${lastDataRow},3)` }
      rows[1][10] = { f: `SUMIFS(K3:K${lastDataRow},A3:A${lastDataRow},3)` }
      for (let mi = 0; mi < meses.length; mi++) {
        const col = colL(mesStartCol + mi)
        rows[1][mesStartCol + mi] = {
          f: `IFERROR(SUMPRODUCT((A3:A${lastDataRow}=3)*(${col}3:${col}${lastDataRow})*(K3:K${lastDataRow}))/SUMIFS(K3:K${lastDataRow},A3:A${lastDataRow},3),"")`,
        }
      }
      rows[1][totalColIdx] = { f: `SUM(${colL(mesStartCol)}2:${colL(mesStartCol + meses.length - 1)}2)` }
    }
    for (let c = 0; c < rows[1].length; c++) {
      const isMes = c >= mesStartCol && c < totalColIdx
      const isCurr = c === 6 || c === 7 || c === 8 || c === 9 || c === 10
      styles[A(1, c)] = withFmt(
        styleGeral,
        isMes || c === totalColIdx ? FMT_PCT : (isCurr ? FMT_BRL : undefined),
      )
    }

    // ── Monta worksheet ───────────────────────────────────────────────
    const ws: any = XLSX.utils.aoa_to_sheet(rows, { cellDates: true })

    // Aplica estilos nos objetos de célula
    for (const [addr, st] of Object.entries(styles)) {
      if (ws[addr]) ws[addr].s = st
    }
    // Garante numFmt nas células que foram criadas como date/serial no header
    for (let mi = 0; mi < meses.length; mi++) {
      const addr = A(0, mesStartCol + mi)
      if (ws[addr]) {
        ws[addr].z = FMT_MES
        ws[addr].s = withFmt(styleHeader, FMT_MES)
      }
    }

    // Larguras (wpx aproximados do original)
    ws['!cols'] = [
      { wch: 6 },   // NÍVEL
      { wch: 16 },  // DISCIPLINA
      { wch: 8 },   // ITEM
      { wch: 60 },  // ATIVIDADE
      { wch: 12 },  // LOCAL
      { wch: 12 },  // QTDE
      { wch: 17 },  // PR.UNIT MATERIAL
      { wch: 17 },  // SUBTOTAL MATERIAL
      { wch: 17 },  // PR.UNIT M.O.
      { wch: 17 },  // SUBTOTAL M.O.
      { wch: 16 },  // VALOR GLOBAL
      ...meses.map(() => ({ wch: 10 })),
      { wch: 10 },  // TOTAL
      { wch: 38, hidden: true }, // detalhamento_id
    ]

    // Altura + outline por linha
    const rowsInfo: any[] = []
    rowsInfo[0] = { hpt: 28.8 } // header
    for (const [idxStr, level] of Object.entries(outlineLevels)) {
      const idx = Number(idxStr)
      rowsInfo[idx] = { ...(rowsInfo[idx] || {}), level }
    }
    ws['!rows'] = rowsInfo

    // Freeze nas 5 primeiras colunas + header
    ws['!freeze'] = { xSplit: 5, ySplit: 1 } as any
    ws['!views']  = [{ state: 'frozen', xSplit: 5, ySplit: 1 }]

    // Outline / sheet options (resumo para baixo dos agrupamentos)
    ;(ws as any)['!outline'] = { summaryBelow: false, summaryRight: false }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'FÍSICO FINANCEIRO')

    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
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
