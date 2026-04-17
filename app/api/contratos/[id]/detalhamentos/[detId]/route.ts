import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { z } from 'zod'

/**
 * PATCH /api/contratos/[id]/detalhamentos/[detId]
 *
 * Atualiza campos de um detalhamento (PR Mat, PR MO, qtde, local, etc.).
 * subtotal_material e subtotal_mo são colunas GENERATED — recalculam sozinhas.
 */

const BodySchema = z.object({
  valor_material_unit: z.number().nullable().optional(),
  valor_servico_unit:  z.number().nullable().optional(),
  quantidade_contratada: z.number().nullable().optional(),
  local: z.string().nullable().optional(),
  unidade: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
}).strict()

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; detId: string }> },
) {
  try {
    const { id: contratoId, detId } = await params
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verifica que o detalhamento pertence ao contrato
    const { data: det, error: detErr } = await admin
      .from('detalhamentos')
      .select('id, tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))')
      .eq('id', detId)
      .single()
    if (detErr || !det) {
      return NextResponse.json({ error: 'detalhamento não encontrado' }, { status: 404 })
    }
    const ownerId = (det as any).tarefa?.grupo_macro?.contrato_id
    if (ownerId !== contratoId) {
      return NextResponse.json({ error: 'detalhamento não pertence ao contrato' }, { status: 403 })
    }

    // Se atualizar PR Mat / PR MO ou qtde, precisamos recalcular valor_unitario + valor_total
    // (esses campos NÃO são generated — subtotal_material e subtotal_mo SIM).
    const patch: Record<string, any> = { ...parsed.data }

    // Carrega valores atuais para compor valor_unitario / valor_total
    if ('valor_material_unit' in patch || 'valor_servico_unit' in patch || 'quantidade_contratada' in patch) {
      const { data: atual } = await admin
        .from('detalhamentos')
        .select('valor_material_unit, valor_servico_unit, quantidade_contratada')
        .eq('id', detId)
        .single()
      const mat = patch.valor_material_unit ?? atual?.valor_material_unit ?? 0
      const mo  = patch.valor_servico_unit  ?? atual?.valor_servico_unit  ?? 0
      const qtd = patch.quantidade_contratada ?? atual?.quantidade_contratada ?? 0
      patch.valor_unitario = Number(mat) + Number(mo)
      patch.valor_total    = Number(qtd) * (Number(mat) + Number(mo))
    }

    const { data, error } = await admin
      .from('detalhamentos')
      .update(patch)
      .eq('id', detId)
      .select('id, codigo, quantidade_contratada, valor_material_unit, valor_servico_unit, subtotal_material, subtotal_mo, valor_unitario, valor_total')
      .single()
    if (error) throw error

    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
