import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { dispararEmailAutorizacao, dispararEmailRejeicao } from '../aprovar/route'

const Body = z.object({
  destinatarios_ids: z.array(z.string().uuid()).min(1, 'Selecione ao menos 1 envolvido.'),
})

/**
 * POST /api/contratos/[id]/fat-direto/solicitacoes/[solId]/reenviar-email
 *
 * Reenvia notificação interna pros envolvidos selecionados. Despacha pro
 * template correto baseado no status atual da solicitacao:
 *   - 'aprovado'  → template de autorizacao (badge [REENVIO])
 *   - 'rejeitado' → template de rejeicao (badge [REENVIO])
 *
 * Outros status sao rejeitados.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão pra reenviar.' }, { status: check.status })
    }
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { destinatarios_ids } = parsed.data
    const { id: contratoId, solId } = await params

    const admin = createAdminClient()
    const { data: sol } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, status, contrato_id, motivo_rejeicao')
      .eq('id', solId)
      .single()

    if (!sol) return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 })
    if ((sol as any).contrato_id !== contratoId) {
      return NextResponse.json({ error: 'Solicitação não pertence a este contrato.' }, { status: 400 })
    }
    const status = (sol as any).status
    if (status !== 'aprovado' && status !== 'rejeitado') {
      return NextResponse.json({ error: 'Só dá pra reenviar notificação de solicitações aprovadas ou rejeitadas.' }, { status: 400 })
    }

    const resultado = status === 'aprovado'
      ? await dispararEmailAutorizacao({
          contratoId,
          solId,
          aprovadorId: check.userId,
          destinatariosIds: destinatarios_ids,
          reenvio: true,
        })
      : await dispararEmailRejeicao({
          contratoId,
          solId,
          rejeitadorId: check.userId,
          destinatariosIds: destinatarios_ids,
          motivoRejeicao: (sol as any).motivo_rejeicao || '',
          reenvio: true,
        })

    await audit({
      event: status === 'aprovado' ? 'solicitacao.email_reenviado' : 'solicitacao.email_rejeicao_reenviado',
      entity_type: 'solicitacao_fat_direto',
      entity_id: solId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: resultado,
      request: req,
    })

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.erro || 'Falha ao reenviar.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, qtd: resultado.qtd, destinos: resultado.destinos })
  } catch (e: any) {
    return apiError(e)
  }
}
