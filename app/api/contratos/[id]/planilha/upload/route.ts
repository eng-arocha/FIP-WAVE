import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/planilha/upload
 * multipart/form-data: file=<xlsx unificado>
 *
 * Lê as abas "Orcamento", "Fisico" e "FatDireto" (todas opcionais) e aplica:
 *   - Orcamento  → PATCH detalhamentos (quantidade_contratada, valor_material_unit, valor_servico_unit)
 *   - Fisico     → upsert planejamento_fisico_det (detalhamento_id, mes, pct_planejado)
 *   - FatDireto  → upsert planejamento_fat_direto_det
 *
 * Cada aba deve ter a coluna "detalhamento_id" (oculta por padrão no template).
 * Segurança: exige permissão 'cronograma.editar' para as curvas; orçamento fica
 * acessível a quem puder chamar o endpoint (admin server via RLS bypass).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

function toNumberBR(v: any): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  if (typeof v === 'number') return v
  const s = String(v).trim().replace(/[R$\s]/g, '').replace('%', '')
  if (!s) return undefined
  const hasComma = s.includes(','), hasDot = s.includes('.')
  let norm = s
  if (hasComma && hasDot) norm = s.replace(/\./g, '').replace(',', '.')
  else if (hasComma) norm = s.replace(',', '.')
  const n = Number(norm)
  return Number.isFinite(n) ? n : undefined
}

function getAoa(wb: XLSX.WorkBook, sheetName: string): any[][] | null {
  const sn = wb.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase())
  if (!sn) return null
  const ws = wb.Sheets[sn]
  if (!ws) return null
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params

    // Cronograma requer permissão explícita; orçamento também (edição de valores)
    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })

    const admin = createAdminClient()

    // dets válidos no contrato
    const { data: allDets, error: loadErr } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo, quantidade_contratada, valor_material_unit, valor_servico_unit,
        tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))
      `)
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    if (loadErr) throw loadErr
    const byId     = new Map((allDets || []).map((d: any) => [d.id, d]))
    const detsValidos = new Set(byId.keys())

    const report: any = {
      orcamento: { presente: false, atualizados: 0, falhas: 0 },
      fisico:    { presente: false, celulas: 0, linhas_ignoradas: 0 },
      fatdireto: { presente: false, celulas: 0, linhas_ignoradas: 0 },
    }

    // ═══════════════════════════════════════════════════
    // ABA ORCAMENTO
    // ═══════════════════════════════════════════════════
    const aoaO = getAoa(wb, 'Orcamento')
    if (aoaO && aoaO.length > 1) {
      report.orcamento.presente = true
      const header = aoaO[0].map((h: any) => String(h ?? '').trim().toLowerCase())
      const col = (...names: string[]) => header.findIndex(h => names.some(n => h === n.toLowerCase()))
      const iId  = col('detalhamento_id')
      const iQtd = col('qtde', 'quantidade', 'quantidade_contratada')
      const iMat = col('pr. mat', 'pr.mat', 'pr mat', 'valor_material_unit')
      const iMo  = col('pr. m.o.', 'pr.m.o.', 'pr mo', 'valor_servico_unit')

      if (iId < 0) {
        report.orcamento.erro = 'coluna detalhamento_id ausente — pule ou corrija'
      } else if (iQtd < 0 && iMat < 0 && iMo < 0) {
        report.orcamento.erro = 'sem coluna editável (Qtde/PR.Mat/PR.MO)'
      } else {
        for (let r = 1; r < aoaO.length; r++) {
          const row = aoaO[r] || []
          const detId = String(row[iId] ?? '').trim()
          if (!detId || !/^[0-9a-f-]{36}$/i.test(detId)) continue
          if (!detsValidos.has(detId)) continue
          const cur: any = byId.get(detId) || {}
          const patch: any = {}
          if (iQtd >= 0) { const v = toNumberBR(row[iQtd]); if (v !== undefined) patch.quantidade_contratada = v }
          if (iMat >= 0) { const v = toNumberBR(row[iMat]); if (v !== undefined) patch.valor_material_unit = v }
          if (iMo  >= 0) { const v = toNumberBR(row[iMo]);  if (v !== undefined) patch.valor_servico_unit  = v }
          if (Object.keys(patch).length === 0) continue

          const mat = patch.valor_material_unit ?? cur.valor_material_unit ?? 0
          const mo  = patch.valor_servico_unit  ?? cur.valor_servico_unit  ?? 0
          const qtd = patch.quantidade_contratada ?? cur.quantidade_contratada ?? 0
          patch.valor_unitario = Number(mat) + Number(mo)
          patch.valor_total    = Number(qtd) * (Number(mat) + Number(mo))

          const { error: upErr } = await admin.from('detalhamentos').update(patch).eq('id', detId)
          if (upErr) report.orcamento.falhas++
          else report.orcamento.atualizados++
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // ABAS FISICO / FATDIRETO
    // ═══════════════════════════════════════════════════
    async function processMatriz(sheetName: string, tipo: 'fisico' | 'fatdireto') {
      const aoa = getAoa(wb, sheetName)
      if (!aoa || aoa.length < 2) return
      const r = tipo === 'fisico' ? report.fisico : report.fatdireto
      r.presente = true

      const header = aoa[0].map((v: any) => String(v ?? '').trim())
      const idIdx = header.findIndex(h => h.toLowerCase() === 'detalhamento_id')
      if (idIdx < 0) { r.erro = 'coluna detalhamento_id ausente'; return }

      const mesColIdxs: { col: number; mes: string }[] = []
      header.forEach((h, i) => {
        const mDate = String(h).trim().match(/^(\d{4})-(\d{2})(-(\d{2}))?$/)
        if (mDate) mesColIdxs.push({ col: i, mes: `${mDate[1]}-${mDate[2]}-01` })
      })
      if (!mesColIdxs.length) { r.erro = 'nenhuma coluna de mês (YYYY-MM-01)'; return }

      const updates: { detalhamento_id: string; mes: string; pct_planejado: number }[] = []
      for (let rr = 1; rr < aoa.length; rr++) {
        const row = aoa[rr]
        if (!row || row.every((c: any) => c === null || c === '')) continue
        const detId = String(row[idIdx] ?? '').trim()
        if (!detId || !/^[0-9a-f-]{36}$/i.test(detId)) { r.linhas_ignoradas++; continue }
        if (!detsValidos.has(detId)) { r.linhas_ignoradas++; continue }
        for (const { col, mes } of mesColIdxs) {
          const v = toNumberBR(row[col])
          if (v === undefined) continue
          if (v < 0 || v > 1000) continue
          updates.push({ detalhamento_id: detId, mes, pct_planejado: v })
        }
      }

      const table = tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'
      for (let i = 0; i < updates.length; i += 1000) {
        const slice = updates.slice(i, i + 1000)
        const { error } = await admin.from(table).upsert(slice, { onConflict: 'detalhamento_id,mes' })
        if (error) throw error
      }
      r.celulas = updates.length
      r.meses_processados = mesColIdxs.length
    }

    await processMatriz('Fisico', 'fisico')
    await processMatriz('FatDireto', 'fatdireto')

    return NextResponse.json(report)
  } catch (e: any) {
    return apiError(e)
  }
}
