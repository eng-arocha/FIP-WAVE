import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararEmailAutorizacao } from '../aprovar/route'

/**
 * POST /api/contratos/[id]/fat-direto/solicitacoes/[solId]/reenviar-email
 *
 * Reenvia o email oficial de autorização ao fornecedor (mesmo template
 * da aprovação, marcado como "REENVIO" no assunto e corpo).
 *
 * Só funciona com solicitações em status 'aprovado'.
 * Permissão: aprovacoes.aprovar (mesma da aprovação original).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Sem permissão pra reenviar autorização.' },
        { status: check.status }
      )
    }
    const { id: contratoId, solId } = await params

    // Valida que a solicitação existe, está aprovada e é desse contrato
    const admin = createAdminClient()
    const { data: sol } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, status, contrato_id, fornecedor_contato')
      .eq('id', solId)
      .single()

    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
    if ((sol as any).contrato_id !== contratoId) {
      return NextResponse.json({ error: 'Solicitação não pertence a este contrato.' }, { status: 400 })
    }
    if ((sol as any).status !== 'aprovado') {
      return NextResponse.json({
        error: 'Só dá pra reenviar email de solicitações aprovadas.',
      }, { status: 400 })
    }

    const resultado = await dispararEmailAutorizacao({
      contratoId,
      solId,
      aprovadorId: check.userId,
      aprovadorEmail: check.userEmail,
      reenvio: true,
    })

    await audit({
      event: 'solicitacao.email_reenviado',
      entity_type: 'solicitacao_fat_direto',
      entity_id: solId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: resultado,
      request: req,
    })

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.erro || 'Falha ao reenviar email.' }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      destino: resultado.destino,
      cc_count: resultado.cc_count,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
