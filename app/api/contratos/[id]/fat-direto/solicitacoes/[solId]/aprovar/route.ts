import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao, getUsuarioLogado } from '@/lib/api/auth'
import { atualizarStatusSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { emitWebhook } from '@/lib/api/webhooks'
import { sendEmail } from '@/lib/email/send'
import { templateSolicitacaoAprovadaFornecedor } from '@/lib/email/templates-fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'

const Body = z.object({
  acao: z.enum(['aprovado', 'rejeitado', 'cancelado', 'aguardando_aprovacao']),
  motivo_rejeicao: z.string().max(2000).optional(),
  /** Quando acao='aprovado' e quiser enviar notificação — lista IDs de usuários (envolvidos). */
  destinatarios_ids: z.array(z.string().uuid()).optional(),
}).refine(b => b.acao !== 'rejeitado' || (b.motivo_rejeicao && b.motivo_rejeicao.trim().length >= 3), {
  message: 'Motivo de rejeição é obrigatório (mín. 3 caracteres).',
  path: ['motivo_rejeicao'],
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { acao, motivo_rejeicao, destinatarios_ids } = parsed.data
    const { id: contratoId, solId } = await params

    if (acao === 'aprovado' || acao === 'rejeitado') {
      const check = await assertPermissao('aprovacoes', 'aprovar')
      if (!check.ok) {
        return NextResponse.json(
          { error: 'Apenas usuários com permissão de aprovação podem aprovar ou rejeitar solicitações.' },
          { status: check.status }
        )
      }
      await atualizarStatusSolicitacao(solId, acao, check.userId, motivo_rejeicao)
      const eventoCanonico = acao === 'aprovado' ? 'solicitacao.aprovada' : 'solicitacao.rejeitada'
      await audit({
        event: eventoCanonico,
        entity_type: 'solicitacao_fat_direto',
        entity_id: solId,
        actor_id: check.userId,
        actor_email: check.userEmail ?? null,
        metadata: acao === 'rejeitado'
          ? { motivo_rejeicao }
          : { enviar_email: !!(destinatarios_ids && destinatarios_ids.length), qtd_destinatarios: destinatarios_ids?.length ?? 0 },
        request: req,
      })
      void emitWebhook(eventoCanonico, {
        solicitacao_id: solId,
        actor_id: check.userId,
        motivo_rejeicao: acao === 'rejeitado' ? motivo_rejeicao : undefined,
      })

      // Ao APROVAR + destinatarios_ids informados: dispara email notificação
      if (acao === 'aprovado' && destinatarios_ids && destinatarios_ids.length > 0) {
        try {
          const emailResultado = await dispararEmailAutorizacao({
            contratoId,
            solId,
            aprovadorId: check.userId,
            destinatariosIds: destinatarios_ids,
            reenvio: false,
          })
          await audit({
            event: 'solicitacao.email_enviado',
            entity_type: 'solicitacao_fat_direto',
            entity_id: solId,
            actor_id: check.userId,
            actor_email: check.userEmail ?? null,
            metadata: emailResultado,
            request: req,
          })
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('Falha ao disparar notificação pós-aprovação:', e)
        }
      }

      return NextResponse.json({ ok: true })
    }

    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    await atualizarStatusSolicitacao(solId, acao, user.id, motivo_rejeicao)
    await audit({
      event: `solicitacao.${acao === 'cancelado' ? 'cancelada' : 'reenviada'}`,
      entity_type: 'solicitacao_fat_direto',
      entity_id: solId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      request: req,
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

/**
 * Dispara notificação interna (email) pros envolvidos selecionados.
 * Usado tanto na aprovação quanto em reenvios.
 *
 * destinatariosIds: array de IDs de `perfis` (usuarios_contratos do contrato).
 * O email NÃO vai pro fornecedor — é notificação interna pro time.
 */
export async function dispararEmailAutorizacao(args: {
  contratoId: string
  solId: string
  aprovadorId: string
  destinatariosIds: string[]
  reenvio: boolean
}): Promise<{ ok: boolean; destinos?: string[]; qtd?: number; erro?: string }> {
  const { contratoId, solId, aprovadorId, destinatariosIds, reenvio } = args
  const admin = createAdminClient()

  const { data: sol } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      numero_pedido_fip, numero, valor_total, observacoes,
      fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato,
      itens:itens_solicitacao_fat_direto (
        descricao, qtde_solicitada, valor_total
      )
    `)
    .eq('id', solId)
    .single()

  if (!sol) return { ok: false, erro: 'solicitação não encontrada' }

  // Busca os emails dos destinatários selecionados (valida que são do contrato)
  const { data: vinculos } = await admin
    .from('usuarios_contratos')
    .select('usuario_id, perfis:usuario_id(id, email, nome)')
    .eq('contrato_id', contratoId)
    .in('usuario_id', destinatariosIds)

  const emails: string[] = []
  for (const v of (vinculos || []) as any[]) {
    const e = v.perfis?.email
    if (e) emails.push(e)
  }
  if (emails.length === 0) return { ok: false, erro: 'nenhum destinatário válido (ver usuarios_contratos)' }

  const perfilAprov = await admin
    .from('perfis').select('nome').eq('id', aprovadorId).single()

  const tpl = templateSolicitacaoAprovadaFornecedor({
    numero_fip: (sol as any).numero_pedido_fip ?? (sol as any).numero,
    fornecedor_razao_social: (sol as any).fornecedor_razao_social,
    fornecedor_cnpj: (sol as any).fornecedor_cnpj,
    fornecedor_contato: (sol as any).fornecedor_contato,
    valor_total: Number((sol as any).valor_total || 0),
    itens: ((sol as any).itens || []).map((it: any) => ({
      descricao: it.descricao,
      qtde: it.qtde_solicitada,
      valor_total: it.valor_total,
    })),
    observacoes: (sol as any).observacoes,
    aprovador_nome: (perfilAprov.data as any)?.nome ?? null,
    reenvio,
  })

  await sendEmail({
    to: emails,
    subject: tpl.subject,
    html: tpl.html,
    tipo: 'aprovado',
  })

  return { ok: true, destinos: emails, qtd: emails.length }
}
