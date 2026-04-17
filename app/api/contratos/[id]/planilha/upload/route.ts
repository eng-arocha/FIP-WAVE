import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/planilha/upload
 * multipart/form-data: file=<xlsx no formato oficial FIP-WAVE>
 *
 * Aceita o formato nativo "Cronograma Físico Financeiro":
 *   Aba FÍSICO FINANCEIRO (ou primeira aba cujo cabeçalho começa com NÍVEL)
 *   Cols A..K: NÍVEL / DISCIPLINA / ITEM / ATIVIDADE / LOCAL / QTDE /
 *             PR. UNIT MATERIAL / SUBTOTAL MATERIAL / PR. UNIT M.O. /
 *             SUBTOTAL MÃO DE OBRA / VALOR GLOBAL
 *   Cols L..: meses (cabeçalho = data do Excel) com % como decimal (0.08 = 8 %)
 *   Cols extras opcionais: TOTAL, detalhamento_id
 *
 * Só as linhas NÍVEL = 3 (detalhamentos) são aplicadas. Match por detalhamento_id
 * (se houver) ou por ITEM (código dentro do contrato). A curva de percentuais é
 * gravada em AMBAS as tabelas de planejamento (físico + fat direto) — é a
 * convenção do "Físico Financeiro" único.
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

// Cabeçalho de mês pode vir como Date, string 'YYYY-MM...', ou número serial Excel.
function headerToMes(cell: any): string | null {
  if (cell instanceof Date) {
    const y = cell.getUTCFullYear(), m = cell.getUTCMonth() + 1
    return `${y}-${String(m).padStart(2, '0')}-01`
  }
  if (typeof cell === 'number') {
    // serial Excel → YYYY-MM-01 (só valida range razoável)
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

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array', cellDates: true })

    // Detecta aba alvo: preferir FÍSICO FINANCEIRO; senão primeira cujo header[0] = 'NÍVEL'
    let sheetName = wb.SheetNames.find(n => /f[ií]sico\s*financeiro/i.test(n))
    if (!sheetName) {
      sheetName = wb.SheetNames.find(sn => {
        const ws = wb.Sheets[sn]
        const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        const head = (a[0] || []) as any[]
        return String(head[0] ?? '').trim().toUpperCase() === 'NÍVEL'
      })
    }
    if (!sheetName) return NextResponse.json({ error: 'aba FÍSICO FINANCEIRO não encontrada (ou cabeçalho não inicia em NÍVEL)' }, { status: 400 })

    const ws = wb.Sheets[sheetName]
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
    if (aoa.length < 2) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    const header = aoa[0] as any[]

    // Descobre índices das colunas-chave por nome (tolerante)
    const headUp = header.map(h => String(h ?? '').replace(/\r|\n/g, ' ').trim().toUpperCase())
    const findCol = (...names: string[]) =>
      headUp.findIndex(h => names.some(n => h === n.toUpperCase()))

    const iNivel = findCol('NÍVEL', 'NIVEL')
    const iItem  = findCol('ITEM')
    const iQtd   = findCol('QTDE', 'QUANTIDADE')
    const iMat   = findCol('PR. UNIT MATERIAL', 'PR.UNIT MATERIAL', 'PR UNIT MATERIAL', 'VALOR_MATERIAL_UNIT')
    const iMo    = findCol('PR. UNIT M.O.', 'PR.UNIT M.O.', 'PR UNIT M.O.', 'PR UNIT MO', 'PR. UNIT MO', 'VALOR_SERVICO_UNIT')
    const iId    = findCol('DETALHAMENTO_ID')

    if (iNivel < 0) return NextResponse.json({ error: 'coluna NÍVEL ausente' }, { status: 400 })
    if (iItem < 0 && iId < 0) return NextResponse.json({ error: 'coluna ITEM (código) ou detalhamento_id necessária' }, { status: 400 })

    // Colunas de mês: a partir da coluna 11 (L), qualquer célula que pareça data/serial
    // Para (L),serão avaliadas até achar "TOTAL" ou detalhamento_id
    const mesColIdxs: { col: number; mes: string }[] = []
    for (let c = 0; c < header.length; c++) {
      const cell = header[c]
      const s = String(cell ?? '').trim().toUpperCase()
      if (s === 'TOTAL' || s === 'DETALHAMENTO_ID' || s === '') continue
      const mes = headerToMes(cell)
      if (mes) mesColIdxs.push({ col: c, mes })
    }

    // Valida detalhamentos do contrato
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
    const detsValidos = new Set(byId.keys())

    const pctUpdates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
    let orcAtualizados = 0, orcFalhas = 0
    let linhasProcessadas = 0, linhasIgnoradas = 0

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] || []
      const nivel = Number(row[iNivel])
      if (nivel !== 3) continue // só detalhamentos
      linhasProcessadas++

      // Resolve detalhamento
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

      // ── Orçamento (QTDE / PR.Mat / PR.MO) ─────────────────────────────
      const patch: any = {}
      if (iQtd >= 0) { const v = toNumberBR(row[iQtd]); if (v !== undefined) patch.quantidade_contratada = v }
      if (iMat >= 0) { const v = toNumberBR(row[iMat]); if (v !== undefined) patch.valor_material_unit = v }
      if (iMo  >= 0) { const v = toNumberBR(row[iMo]);  if (v !== undefined) patch.valor_servico_unit  = v }
      if (Object.keys(patch).length > 0) {
        const mat = patch.valor_material_unit ?? det.valor_material_unit ?? 0
        const mo  = patch.valor_servico_unit  ?? det.valor_servico_unit  ?? 0
        const qtd = patch.quantidade_contratada ?? det.quantidade_contratada ?? 0
        patch.valor_unitario = Number(mat) + Number(mo)
        patch.valor_total    = Number(qtd) * (Number(mat) + Number(mo))
        const { error: upErr } = await admin.from('detalhamentos').update(patch).eq('id', det.id)
        if (upErr) orcFalhas++
        else orcAtualizados++
      }

      // ── Percentuais dos meses ─────────────────────────────────────────
      for (const { col, mes } of mesColIdxs) {
        const raw = row[col]
        if (raw === null || raw === undefined || raw === '') continue
        const v = toNumberBR(raw)
        if (v === undefined) continue
        // Formato oficial = decimal (0.08 = 8 %). Se algum operador digitou "8" achando
        // que era inteiro, ainda dá pra aceitar: assume-se decimal quando |v| ≤ 2 e %
        // quando > 2. (1.0 = 100 %, 12.5 = 12.5 %.)
        let pct: number
        if (Math.abs(v) <= 2) pct = v * 100
        else pct = v
        if (pct < 0 || pct > 1000) continue
        pctUpdates.push({ detalhamento_id: det.id, mes, pct_planejado: pct })
      }
    }

    // Aplica curva em Físico E em Fat Direto (convenção do "Físico Financeiro" único)
    let celulasFisico = 0, celulasFat = 0
    if (pctUpdates.length) {
      for (let i = 0; i < pctUpdates.length; i += 1000) {
        const slice = pctUpdates.slice(i, i + 1000)
        const [f, d] = await Promise.all([
          admin.from('planejamento_fisico_det').upsert(slice, { onConflict: 'detalhamento_id,mes' }),
          admin.from('planejamento_fat_direto_det').upsert(slice, { onConflict: 'detalhamento_id,mes' }),
        ])
        if (f.error) throw f.error
        if (d.error) throw d.error
        celulasFisico += slice.length
        celulasFat += slice.length
      }
    }

    return NextResponse.json({
      aba: sheetName,
      orcamento: { atualizados: orcAtualizados, falhas: orcFalhas },
      fisico:    { celulas: celulasFisico, meses: mesColIdxs.length },
      fatdireto: { celulas: celulasFat,    meses: mesColIdxs.length },
      linhas_nivel3: linhasProcessadas,
      linhas_ignoradas: linhasIgnoradas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
