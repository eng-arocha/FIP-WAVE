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
    const { acao, motivo_rejeicao } = parsed.data
    const { solId } = await params

    // Aprovar/rejeitar exige a permissão `aprovacoes.aprovar`.
    // Cancelar e reenviar para análise são ações do solicitante — basta autenticação.
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
        metadata: acao === 'rejeitado' ? { motivo_rejeicao } : undefined,
        request: req,
      })
      void emitWebhook(eventoCanonico, {
        solicitacao_id: solId,
        actor_id: check.userId,
        motivo_rejeicao: acao === 'rejeitado' ? motivo_rejeicao : undefined,
      })

      // Ao APROVAR: dispara email padrão ao fornecedor com dados da obra +
      // prazo de pagamento (textos vêm de env — validação jurídica sem redeploy)
      if (acao === 'aprovado') {
        try {
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

          // Email do destinatário: priority = fornecedor_contato (email explícito)
          // > extraído de fornecedor_contato_* no cadastro (não implementado ainda)
          const destEmail = extrairEmail(sol?.fornecedor_contato)
          if (sol && destEmail) {
            const perfilAprov = await admin
              .from('perfis').select('nome').eq('id', check.userId).single()
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
            })
            await sendEmail({
              to: destEmail,
              subject: tpl.subject,
              html: tpl.html,
              tipo: 'aprovado',
            }).catch(() => null)
          }
        } catch {
          // Email é best-effort — não falha a aprovação se der erro
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
 * Extrai o primeiro email válido de um texto livre. `fornecedor_contato`
 * hoje armazena contato como texto livre ("João — joao@x.com · (11) 9999").
 * Pega o primeiro match de regex email. Retorna null se nenhum.
 */
function extrairEmail(texto: string | null | undefined): string | null {
  if (!texto) return null
  const m = String(texto).match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  return m ? m[0].toLowerCase() : null
}
