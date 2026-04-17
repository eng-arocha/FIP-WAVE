import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/orcamento/upload
 * multipart/form-data: file=<xlsx gerado por /orcamento/template>
 *
 * Lê a aba "Orcamento" (ou primeira aba) e atualiza os detalhamentos via
 * match por detalhamento_id (ou, em fallback, por det_codigo). Campos aceitos:
 *   - quantidade         → quantidade_contratada
 *   - valor_material_unit
 *   - valor_servico_unit
 *
 * Valida que cada detalhamento pertence ao contrato antes de aplicar.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function toNumberBR(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/[R$\s]/g, '')
  if (!s) return undefined
  // Se tem "," como decimal e "." como milhar
  const hasComma = s.includes(',')
  const hasDot = s.includes('.')
  let norm = s
  if (hasComma && hasDot) {
    // Assume formato BR: pontos como milhar, vírgula decimal
    norm = s.replace(/\./g, '').replace(',', '.')
  } else if (hasComma) {
    norm = s.replace(',', '.')
  }
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
    const sheetName = wb.SheetNames.includes('Orcamento') ? 'Orcamento' : wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
    if (!aoa.length) return NextResponse.json({ error: 'planilha vazia' }, { status: 400 })

    const header = (aoa[0] || []).map((h: any) => String(h ?? '').trim().toLowerCase())
    // Aceita tanto o template novo (8 colunas da planilha oficial) quanto o antigo.
    const matchCol = (...names: string[]) => header.findIndex(h => names.some(n => h === n.toLowerCase()))

    const iId  = matchCol('detalhamento_id')
    const iCod = matchCol('cód.', 'cod.', 'codigo', 'código', 'det_codigo')
    const iQtd = matchCol('qtde', 'quantidade', 'qtd', 'quantidade_contratada')
    const iMat = matchCol('pr. mat', 'pr.mat', 'pr mat', 'valor_material_unit')
    const iMo  = matchCol('pr. m.o.', 'pr.m.o.', 'pr. mo', 'pr mo', 'valor_servico_unit')

    if (iId < 0 && iCod < 0) {
      return NextResponse.json({ error: 'coluna detalhamento_id ou Cód. obrigatória no cabeçalho' }, { status: 400 })
    }
    if (iQtd < 0 && iMat < 0 && iMo < 0) {
      return NextResponse.json({ error: 'preencha pelo menos uma coluna: Qtde, PR. Mat ou PR. M.O.' }, { status: 400 })
    }

    const updates: Array<{ detalhamento_id?: string; codigo?: string; quantidade_contratada?: number; valor_material_unit?: number; valor_servico_unit?: number }> = []
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r] || []
      const detId  = iId  >= 0 ? (row[iId]  ? String(row[iId]).trim()  : '') : ''
      const codigo = iCod >= 0 ? (row[iCod] ? String(row[iCod]).trim() : '') : ''
      if (!detId && !codigo) continue
      // Ignora linha de total
      if (!detId && /^total/i.test(codigo)) continue

      const u: any = {}
      if (detId) u.detalhamento_id = detId
      else u.codigo = codigo

      let hasAny = false
      if (iQtd >= 0) { const v = toNumberBR(row[iQtd]); if (v !== undefined) { u.quantidade_contratada = v; hasAny = true } }
      if (iMat >= 0) { const v = toNumberBR(row[iMat]); if (v !== undefined) { u.valor_material_unit = v; hasAny = true } }
      if (iMo  >= 0) { const v = toNumberBR(row[iMo]);  if (v !== undefined) { u.valor_servico_unit  = v; hasAny = true } }
      if (hasAny) updates.push(u)
    }

    if (!updates.length) return NextResponse.json({ error: 'nenhuma linha com valores editáveis' }, { status: 400 })

    // Valida que todos os dets pertencem ao contrato
    const admin = createAdminClient()
    const { data: allDets, error: loadErr } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo,
        tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))
      `)
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    if (loadErr) throw loadErr

    const byId     = new Map((allDets || []).map((d: any) => [d.id, d]))
    const byCodigo = new Map((allDets || []).map((d: any) => [d.codigo, d]))

    const results: Array<{ ok: boolean; detalhamento_id?: string; codigo?: string; error?: string }> = []

    // Preload existing values for valor_unitario / valor_total recalc
    const { data: allFull } = await admin
      .from('detalhamentos')
      .select('id, quantidade_contratada, valor_material_unit, valor_servico_unit')
      .in('id', Array.from(byId.keys()))
    const currentById = new Map((allFull || []).map((d: any) => [d.id, d]))

    for (const u of updates) {
      try {
        const existing: any = u.detalhamento_id ? byId.get(u.detalhamento_id) : byCodigo.get(u.codigo!)
        if (!existing) {
          results.push({ ok: false, codigo: u.codigo, detalhamento_id: u.detalhamento_id, error: 'não encontrado no contrato' })
          continue
        }
        const cur = currentById.get(existing.id) || {}
        const patch: any = {}
        if (u.valor_material_unit   !== undefined) patch.valor_material_unit = u.valor_material_unit
        if (u.valor_servico_unit    !== undefined) patch.valor_servico_unit  = u.valor_servico_unit
        if (u.quantidade_contratada !== undefined) patch.quantidade_contratada = u.quantidade_contratada

        const mat = patch.valor_material_unit ?? cur.valor_material_unit ?? 0
        const mo  = patch.valor_servico_unit  ?? cur.valor_servico_unit  ?? 0
        const qtd = patch.quantidade_contratada ?? cur.quantidade_contratada ?? 0
        patch.valor_unitario = Number(mat) + Number(mo)
        patch.valor_total    = Number(qtd) * (Number(mat) + Number(mo))

        const { error: upErr } = await admin
          .from('detalhamentos')
          .update(patch)
          .eq('id', existing.id)
        if (upErr) {
          results.push({ ok: false, detalhamento_id: existing.id, codigo: existing.codigo, error: upErr.message })
        } else {
          results.push({ ok: true, detalhamento_id: existing.id, codigo: existing.codigo })
        }
      } catch (e: any) {
        results.push({ ok: false, codigo: u.codigo, detalhamento_id: u.detalhamento_id, error: String(e?.message || e) })
      }
    }

    const okCount = results.filter(r => r.ok).length
    return NextResponse.json({
      total: results.length,
      atualizados: okCount,
      falhas: results.length - okCount,
      resultados: results,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
