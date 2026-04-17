import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { z } from 'zod'

/**
 * PATCH /api/contratos/[id]/detalhamentos/bulk
 *
 * Atualização em massa de detalhamentos. Usado por:
 *   - Paste estilo Excel na aba Estrutura (colar várias linhas de uma vez)
 *   - Importador .xlsx (Opção 3) — mesma API, origem diferente
 *
 * Body:
 *   { updates: [
 *       { detalhamento_id | codigo, valor_material_unit?, valor_servico_unit?, quantidade_contratada? },
 *       ...
 *     ] }
 *
 * Aceita match por id OU por código (útil para importador que só conhece o código).
 * Todos os detalhamentos devem pertencer ao contrato — valida antes de aplicar.
 * Não-transacional (RPC seria melhor), mas aplica rollback-like: se algum update
 * falhar, os anteriores já persistiram; a resposta lista cada resultado.
 */

const ItemSchema = z.object({
  detalhamento_id: z.string().uuid().optional(),
  codigo: z.string().optional(),
  valor_material_unit: z.number().nullable().optional(),
  valor_servico_unit:  z.number().nullable().optional(),
  quantidade_contratada: z.number().nullable().optional(),
  local: z.string().nullable().optional(),
}).refine(d => d.detalhamento_id || d.codigo, { message: 'precisa de detalhamento_id ou codigo' })

const BodySchema = z.object({
  updates: z.array(ItemSchema).min(1).max(2000),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const admin = createAdminClient()

    // Carrega todos os detalhamentos do contrato (id + código) para validar match
    const { data: allDets, error: loadErr } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo, quantidade_contratada, valor_material_unit, valor_servico_unit,
        tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))
      `)
      .eq('tarefa.grupo_macro.contrato_id', contratoId)
    if (loadErr) throw loadErr

    const byId     = new Map((allDets || []).map((d: any) => [d.id, d]))
    const byCodigo = new Map((allDets || []).map((d: any) => [d.codigo, d]))

    const results: Array<{ ok: boolean; detalhamento_id?: string; codigo?: string; error?: string }> = []

    for (const u of parsed.data.updates) {
      try {
        const existing: any = u.detalhamento_id ? byId.get(u.detalhamento_id) : byCodigo.get(u.codigo!)
        if (!existing) {
          results.push({ ok: false, codigo: u.codigo, detalhamento_id: u.detalhamento_id, error: 'não encontrado no contrato' })
          continue
        }

        const patch: Record<string, any> = {}
        if (u.valor_material_unit !== undefined) patch.valor_material_unit = u.valor_material_unit
        if (u.valor_servico_unit  !== undefined) patch.valor_servico_unit  = u.valor_servico_unit
        if (u.quantidade_contratada !== undefined) patch.quantidade_contratada = u.quantidade_contratada
        if (u.local !== undefined) patch.local = u.local

        // Recalcula valor_unitario e valor_total (subtotais são GENERATED)
        const mat = patch.valor_material_unit ?? existing.valor_material_unit ?? 0
        const mo  = patch.valor_servico_unit  ?? existing.valor_servico_unit  ?? 0
        const qtd = patch.quantidade_contratada ?? existing.quantidade_contratada ?? 0
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
