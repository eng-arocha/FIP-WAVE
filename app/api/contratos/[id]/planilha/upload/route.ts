import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/planilha/upload
 *
 * Auto-detecta o tipo do arquivo e aplica:
 *
 *   ┌───────────────────────┬───────────────────────┬──────────────────────┐
 *   │  Arquivo              │  Orçamento atualizado │  Cronograma aplicado │
 *   ├───────────────────────┼───────────────────────┼──────────────────────┤
 *   │  FÍSICO FINANCEIRO    │  QTDE + PR.Mat + PR.MO│  planejamento_fisico │
 *   │  (tem col PR.UNIT M.O)│                       │                      │
 *   ├───────────────────────┼───────────────────────┼──────────────────────┤
 *   │  FATURAMENTO DIRETO   │  NADA (à prova de    │  planejamento_fat_   │
 *   │  (sem col PR.UNIT M.O)│  erro — só curva %)  │  direto              │
 *   └───────────────────────┴───────────────────────┴──────────────────────┘
 *
 * Só NÍVEL=3 vira update. Match por ITEM (código) ou detalhamento_id.
 *
 * Segurança: permissão 'cronograma.editar'.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function toNumberBR(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/[R$\s]/g, '').replace('%', '')
  if (!s) return undefined
  const hasComma = s.includes(','), hasDot = s.includes('.')
  let norm = s
  if (hasComma && hasDot) norm = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) norm = s.replace(',', '.')
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

function headerToMes(cell: any): string | null {
  if (cell instanceof Date) {
    const y = cell.getUTCFullYear(), m = cell.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof cell === 'number') {
    if (cell < 20000 || cell > 80000) return null
    const ms = (cell - 25569) * 86400 * 1000
    const d = new Date(ms)
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof cell === 'string') {
    const mDate = cell.trim().match(/^(\d{4})-(\d{2})(-(\d{2}))?$/)
    if (mDate) return `${mDate[1]}-${mDate[2]}-01`
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params

    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(req.url)
    const reset = url.searchParams.get('reset') === '1'

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array', cellDates: true })

    // Escolhe a aba: prioriza nomes conhecidos, senão primeira cujo header começa com NÍVEL
    let sheetName = wb.SheetNames.find(n => /f[ií]sico\s*financeiro/i.test(n))
      || wb.SheetNames.find(n => /faturamento\s*direto/i.test(n))
    if (!sheetName) {
      sheetName = wb.SheetNames.find(sn => {
        const a = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null })
        const h = (a[0] || []) as any[]
        return String(h[0] ?? '').trim().toUpperCase() === 'NÍVEL'
      })
    }
    if (!sheetName) return NextResponse.json({ error: 'planilha não reconhecida — aba deve ser FÍSICO FINANCEIRO ou FATURAMENTO DIRETO (ou começar com coluna NÍVEL)' }, { status: 400 })

    const ws = wb.Sheets[sheetName]
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
    if (aoa.length < 2) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    const header = aoa[0] as any[]
    const headUp = header.map(h => String(h ?? '').replace(/\r|\n/g, ' ').trim().toUpperCase())
    const findCol = (...names: string[]) => headUp.findIndex(h => names.some(n => h === n.toUpperCase()))

    const iNivel = findCol('NÍVEL', 'NIVEL')
    const iItem  = findCol('ITEM')
    const iQtd   = findCol('QTDE', 'QUANTIDADE')
    const iMat   = findCol('PR. UNIT MATERIAL', 'PR.UNIT MATERIAL', 'PR UNIT MATERIAL', 'VALOR_MATERIAL_UNIT')
    const iMo    = findCol('PR. UNIT M.O.', 'PR.UNIT M.O.', 'PR UNIT M.O.', 'PR UNIT MO', 'PR. UNIT MO', 'VALOR_SERVICO_UNIT')
    const iId    = findCol('DETALHAMENTO_ID')

    if (iNivel < 0) return NextResponse.json({ error: 'coluna NÍVEL ausente' }, { status: 400 })
    if (iItem < 0 && iId < 0) return NextResponse.json({ error: 'coluna ITEM (código) ou detalhamento_id necessária' }, { status: 400 })

    // AUTO-DETECT: físico tem PR.UNIT M.O.; fat direto NÃO tem
    const tipo: 'fisico' | 'fatdireto' = (iMo >= 0 || /f[ií]sico/i.test(sheetName))
      ? 'fisico'
      : 'fatdireto'

    // Colunas de mês — tenta linha 0 (header tradicional) e cai para linha 1
    // quando o arquivo segue o padrão "upload" (meses na linha do GERAL).
    const scanMesRow = (r: number): { col: number; mes: string }[] => {
      const out: { col: number; mes: string }[] = []
      const row = aoa[r] || []
      for (let c = 0; c < Math.max(header.length, row.length); c++) {
        const raw = row[c]
        const s = String(raw ?? '').trim().toUpperCase()
        if (s === 'TOTAL' || s === 'DETALHAMENTO_ID') continue
        const mes = headerToMes(raw)
        if (mes) out.push({ col: c, mes })
      }
      return out
    }
    let mesColIdxs = scanMesRow(0)
    // Se não achou meses em row 0, tenta row 1 (padrão "upload" do FIP-WAVE)
    // e nesse caso a primeira linha de dados passa a ser row 2.
    let dataStartRow = 1
    if (mesColIdxs.length === 0 && aoa.length >= 3) {
      const fromRow1 = scanMesRow(1)
      if (fromRow1.length > 0) {
        mesColIdxs = fromRow1
        dataStartRow = 2
      }
    }

    const admin = createAdminClient()
    const { data: allDets, error: loadErr } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo, quantidade_contratada, valor_material_unit, valor_servico_unit,
        tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))
      `)
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    if (loadErr) throw loadErr

    const byId     = new Map((allDets || []).map((d: any) => [d.id, d]))
    const byCodigo = new Map((allDets || []).map((d: any) => [String(d.codigo), d]))

    const pctUpdates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
    let orcAtualizados = 0, orcFalhas = 0
    let linhasProcessadas = 0, linhasIgnoradas = 0
    const orcErros: string[] = []

    for (let r = dataStartRow; r < aoa.length; r++) {
      const row = aoa[r] || []
      const nivel = Number(row[iNivel])
      if (nivel !== 3) continue
      linhasProcessadas++

      let det: any = null
      if (iId >= 0) {
        const raw = String(row[iId] ?? '').trim()
        if (raw && /^[0-9a-f-]{36}$/i.test(raw)) det = byId.get(raw)
      }
      if (!det && iItem >= 0) {
        const codigo = String(row[iItem] ?? '').trim()
        if (codigo) det = byCodigo.get(codigo)
      }
      if (!det) { linhasIgnoradas++; continue }

      // Orçamento — SOMENTE upload de Físico atualiza preços/qtdes.
      // Fat Direto é à prova de erro: só aplica curva %, nunca mexe em orçamento.
      const patch: any = {}
      if (tipo === 'fisico') {
        if (iQtd >= 0) { const v = toNumberBR(row[iQtd]); if (v !== undefined) patch.quantidade_contratada = v }
        if (iMat >= 0) { const v = toNumberBR(row[iMat]); if (v !== undefined) patch.valor_material_unit = v }
        if (iMo  >= 0) { const v = toNumberBR(row[iMo]);  if (v !== undefined) patch.valor_servico_unit  = v }
      }
      if (Object.keys(patch).length > 0) {
        // valor_unitario e valor_total são colunas GERADAS no banco — não aceitam write.
        // Só enviamos os campos-fonte (qtde, valor_material_unit, valor_servico_unit).
        const { error: upErr } = await admin.from('detalhamentos').update(patch).eq('id', det.id)
        if (upErr) { orcFalhas++; if (orcErros.length < 3) orcErros.push(`${det.codigo}: ${upErr.message} | patch=${JSON.stringify(patch)}`) }
        else orcAtualizados++
      }

      // Percentuais
      for (const { col, mes } of mesColIdxs) {
        const raw = row[col]
        if (raw === null || raw === undefined || raw === '') continue
        const v = toNumberBR(raw)
        if (v === undefined) continue
        // Aceita decimal (0.08) ou inteiro (8) — detecta pelo valor
        const pct = Math.abs(v) <= 2 ? v * 100 : v
        if (pct < 0 || pct > 1000) continue
        pctUpdates.push({ detalhamento_id: det.id, mes, pct_planejado: pct })
      }
    }

    // Aplica curva APENAS na tabela correspondente ao tipo detectado
    const tableTipo = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
    let celulasAplicadas = 0
    let celulasLimpas = 0

    // Se reset=1, apaga TODAS as linhas da curva desse tipo para os detalhamentos
    // do contrato antes de inserir — garante que curvas antigas (meses ou
    // detalhamentos que não estão no novo arquivo) não fiquem como lixo.
    if (reset) {
      const detIds = (allDets || []).map((d: any) => d.id)
      if (detIds.length) {
        const { count, error: delErr } = await admin
          .from(tableTipo)
          .delete({ count: 'exact' })
          .in('detalhamento_id', detIds)
        if (delErr) throw delErr
        celulasLimpas = count ?? 0
      }
    }

    if (pctUpdates.length) {
      for (let i = 0; i < pctUpdates.length; i += 1000) {
        const slice = pctUpdates.slice(i, i + 1000)
        const { error } = await admin.from(tableTipo).upsert(slice, { onConflict: 'detalhamento_id,mes' })
        if (error) throw error
        celulasAplicadas += slice.length
      }
    }

    return NextResponse.json({
      tipo_detectado: tipo,
      aba: sheetName,
      orcamento: { atualizados: orcAtualizados, falhas: orcFalhas, erros: orcErros },
      cronograma: { tipo, celulas: celulasAplicadas, meses: mesColIdxs.length, limpas: celulasLimpas, reset },
      linhas_nivel3: linhasProcessadas,
      linhas_ignoradas: linhasIgnoradas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
