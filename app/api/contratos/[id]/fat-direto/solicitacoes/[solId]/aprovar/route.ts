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
import { emailsCcDoContrato } from '@/lib/db/usuarios-contrato'
import { createAdminClient } from '@/lib/supabase/admin'

const Body = z.object({
  acao: z.enum(['aprovado', 'rejeitado', 'cancelado', 'aguardando_aprovacao']),
  motivo_rejeicao: z.string().max(2000).optional(),
  /** Quando acao='aprovado', controla se dispara email de autorização ao fornecedor. Default: true. */
  enviar_email: z.boolean().default(true),
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
    const { acao, motivo_rejeicao, enviar_email } = parsed.data
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
        metadata: acao === 'rejeitado' ? { motivo_rejeicao } : { enviar_email },
        request: req,
      })
      void emitWebhook(eventoCanonico, {
        solicitacao_id: solId,
        actor_id: check.userId,
        motivo_rejeicao: acao === 'rejeitado' ? motivo_rejeicao : undefined,
      })

      // Ao APROVAR + enviar_email=true: dispara email ao fornecedor com CC pros usuários do contrato
      if (acao === 'aprovado' && enviar_email) {
        try {
          const emailResultado = await dispararEmailAutorizacao({
            contratoId,
            solId,
            aprovadorId: check.userId,
            aprovadorEmail: check.userEmail,
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
          // Email é best-effort — não falha a aprovação se der erro
          // eslint-disable-next-line no-console
          console.error('Falha ao disparar email pós-aprovação:', e)
        }
      }

      return NextResponse.json({ ok: true })
    }

    // Demais ações: precisa estar autenticado
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
 * Dispara o email oficial de autorização ao fornecedor.
 * Usado tanto na aprovação quanto em reenvios manuais.
 *
 * Destinatário (TO): email do fornecedor (extraído de fornecedor_contato)
 * CC: todos os usuários atrelados ao contrato (usuarios_contratos)
 */
export async function dispararEmailAutorizacao(args: {
  contratoId: string
  solId: string
  aprovadorId: string
  aprovadorEmail?: string | null
  reenvio: boolean
}): Promise<{ ok: boolean; destino?: string; cc_count?: number; erro?: string }> {
  const { contratoId, solId, aprovadorId, aprovadorEmail, reenvio } = args
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

  const destEmail = extrairEmail((sol as any).fornecedor_contato)
  if (!destEmail) return { ok: false, erro: 'sem email do fornecedor em fornecedor_contato' }

  const perfilAprov = await admin
    .from('perfis').select('nome').eq('id', aprovadorId).single()

  const ccList = await emailsCcDoContrato(contratoId, {
    excluirEmail: aprovadorEmail ?? undefined,
  })

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
    to: destEmail,
    cc: ccList.length > 0 ? ccList : undefined,
    subject: tpl.subject,
    html: tpl.html,
    tipo: 'aprovado',
  })

  return { ok: true, destino: destEmail, cc_count: ccList.length }
}

/**
 * Extrai o primeiro email válido de um texto livre. `fornecedor_contato`
 * hoje armazena contato como texto livre ("João — joao@x.com · (11) 9999").
 */
function extrairEmail(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = String(texto).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  return m ? m[0].toLowerCase() : null
}
