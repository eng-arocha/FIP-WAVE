import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, valorMonetario, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

const Body = z.object({
  valor_glosa: valorMonetario({ min: 0 }),
  motivo_glosa: z.string().trim().max(2000).optional(),
})

const ParamsSchema = z.object({ itemId: uuid() })

/**
 * PUT /api/medicao-itens/[itemId]/glosa
 *
 * Aplica/atualiza a glosa de um item de medição. Só usuários com
 * permissão `medicoes.aprovar` podem aplicar — é decisão de fiscalização.
 *
 * Bloqueio: se a medição associada já está aprovada, glosa não pode
 * mais ser alterada (precisa abrir nova medição corretiva).
 */
export async function PUT(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem aplicar glosa.' },
        { status: check.status },
      )
    }

    const { itemId } = await params
    if (!ParamsSchema.safeParse({ itemId }).success) {
      return NextResponse.json({ error: 'itemId inválido' }, { status: 400 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { valor_glosa, motivo_glosa } = parsed.data

    if (valor_glosa > 0 && !motivo_glosa) {
      return NextResponse.json(
        { error: 'Motivo da glosa é obrigatório quando valor > 0.' },
        { status: 400 },
      )
    }

    const admin = createAdminClient()

    // Verifica que o item existe e que sua medição NÃO está aprovada
    const { data: item, error: getErr } = await admin
      .from('medicao_itens')
      .select('id, valor_medido, valor_glosa, motivo_glosa, medicao:medicoes!inner(id, status)')
      .eq('id', itemId)
      .single()
    if (getErr || !item) {
      return NextResponse.json({ error: 'Item de medição não encontrado.' }, { status: 404 })
    }

    const med: any = (item as any).medicao
    if (med?.status === 'aprovado') {
      return NextResponse.json(
        { error: 'Medição já aprovada. Para corrigir, crie uma nova medição corretiva.', code: 'MEDICAO_APROVADA' },
        { status: 409 },
      )
    }

    if (valor_glosa > Number(item.valor_medido || 0)) {
      return NextResponse.json(
        { error: 'Glosa não pode ser maior que o valor medido do item.', code: 'GLOSA_EXCESSIVA' },
        { status: 400 },
      )
    }

    const before = { valor_glosa: item.valor_glosa, motivo_glosa: item.motivo_glosa }
    const after = { valor_glosa, motivo_glosa: motivo_glosa ?? null }

    const { error: upErr } = await admin
      .from('medicao_itens')
      .update(after)
      .eq('id', itemId)
    if (upErr) throw upErr

    await audit({
      event: 'medicao_item.glosa_aplicada',
      entity_type: 'medicao_item',
      entity_id: itemId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before,
      after,
      metadata: { medicao_id: med?.id },
      request: req,
    })

    return NextResponse.json({ ok: true, valor_glosa, motivo_glosa: motivo_glosa ?? null })
  } catch (e: any) {
    return apiError(e)
  }
}
