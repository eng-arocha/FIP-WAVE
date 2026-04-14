import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { desaprovarSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { emitWebhook } from '@/lib/api/webhooks'

const Body = z.object({
  motivo: z.string().trim().min(3, 'Informe o motivo da desaprovação (mín. 3 caracteres).').max(2000),
})

/**
 * POST /api/fat-direto/solicitacoes/[id]/desaprovar
 *
 * Reverte uma solicitação aprovada de volta ao status 'rascunho'.
 * Apenas usuários com permissão `aprovacoes.aprovar` podem desaprovar.
 *
 * Body: { motivo: string }
 *
 * Efeito:
 *   - status → 'rascunho'
 *   - aprovador_id → null
 *   - data_aprovacao → null
 *   - desaprovado_em → now()
 *   - desaprovado_por → userId
 *   - motivo_desaprovacao → motivo
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const check = await assertPermissao('aprovacoes', 'aprovar')
  if (!check.ok) {
    return NextResponse.json(
      { error: 'Apenas usuários com permissão de aprovação podem desaprovar solicitações.' },
      { status: check.status }
    )
  }

  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { id } = await params
    const { motivo } = parsed.data

    await desaprovarSolicitacao(id, check.userId, motivo)

    await audit({
      event: 'solicitacao.desaprovada',
      entity_type: 'solicitacao_fat_direto',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: { motivo },
      request: req,
    })
    void emitWebhook('solicitacao.desaprovada', { solicitacao_id: id, motivo, actor_id: check.userId })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e?.message === 'MIGRATION_027_PENDING') {
      return NextResponse.json(
        { error: 'A funcionalidade de desaprovação ainda não está ativa. Rode a migration 027 no Supabase SQL Editor.' },
        { status: 503 }
      )
    }
    return apiError(e)
  }
}
