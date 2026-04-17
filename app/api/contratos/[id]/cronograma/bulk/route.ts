import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import { z } from 'zod'

/**
 * PATCH /api/contratos/[id]/cronograma/bulk
 *
 * Upsert em massa de %s do cronograma físico/fat-direto no nível DETALHAMENTO.
 *
 * Body:
 *   {
 *     tipo: 'fisico' | 'fatdireto',
 *     updates: [{ detalhamento_id: UUID, mes: 'YYYY-MM-01', pct_planejado: number }]
 *   }
 *
 * Segurança: admin OU permissão 'cronograma.editar'.
 * Valida que cada detalhamento pertence a uma tarefa de um grupo do contrato.
 */

const BodySchema = z.object({
  tipo: z.enum(['fisico', 'fatdireto']),
  updates: z.array(z.object({
    detalhamento_id: z.string().uuid(),
    mes: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pct_planejado: z.number().min(0).max(1000),
  })).min(1).max(5000),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params

    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const admin = createAdminClient()

    // Valida que os detalhamentos pertencem ao contrato (via tarefa → grupo)
    const detIds = Array.from(new Set(parsed.data.updates.map(u => u.detalhamento_id)))
    const { data: dets } = await admin
      .from('detalhamentos')
      .select('id, tarefa:tarefas!inner(grupo_macro:grupos_macro!inner(contrato_id))')
      .in('id', detIds)
    const detsValidos = new Set(
      (dets || [])
        .filter((d: any) => d.tarefa?.grupo_macro?.contrato_id === contratoId)
        .map((d: any) => d.id)
    )

    const valid = parsed.data.updates.filter(u => detsValidos.has(u.detalhamento_id))
    if (valid.length === 0) {
      return NextResponse.json({ error: 'nenhum detalhamento válido no contrato' }, { status: 400 })
    }

    const table = parsed.data.tipo === 'fisico' ? 'planejamento_fisico_det' : 'planejamento_fat_direto_det'

    const rows = valid.map(u => ({
      detalhamento_id: u.detalhamento_id,
      mes: u.mes,
      pct_planejado: u.pct_planejado,
    }))

    const { error } = await admin
      .from(table)
      .upsert(rows, { onConflict: 'detalhamento_id,mes' })
    if (error) throw error

    return NextResponse.json({
      atualizados: rows.length,
      rejeitados: parsed.data.updates.length - rows.length,
      tipo: parsed.data.tipo,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
