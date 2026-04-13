import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { desaprovarSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'

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
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''

    if (!motivo) {
      return NextResponse.json(
        { error: 'Informe o motivo da desaprovação.' },
        { status: 400 }
      )
    }

    await desaprovarSolicitacao(id, check.userId, motivo)
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
