import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { decidirSolicitacaoEncerramento } from '@/lib/db/encerramento-saldo'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { EncerramentoError } from '@/lib/db/fat-direto'
import { sendEmail } from '@/lib/email/send'
import {
  templateEncerramentoSaldoAprovado,
  templateEncerramentoSaldoRejeitado,
} from '@/lib/email/templates-fat-direto'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/encerramento-saldo/[id]
 *   Decide uma solicitação de encerramento de saldo (aprovar OU rejeitar).
 *
 *   Body:
 *     { acao: 'aprovar' | 'rejeitar', motivo_rejeicao?: string }
 *
 *   Permissão: `medicoes.aprovar` (mesma que aprovar medições — quem aprova
 *   medição deveria poder aprovar encerramento de saldo, dado que o
 *   encerramento afeta diretamente o cálculo financeiro do contrato).
 *
 *   Quando aprovado, dispara `encerrarSolicitacao()` (lib/db/fat-direto.ts):
 *     - status do pedido vira 'encerrado'
 *     - saldo é distribuído proporcionalmente entre os itens (devolvido)
 *     - retido das medições é recalculado automaticamente
 */

const Body = z.object({
  acao: z.enum(['aprovar', 'rejeitar']),
  motivo_rejeicao: z.string().trim().max(2000).optional(),
})

const ParamsSchema = z.object({ id: uuid() })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Permissão: mesma que aprovar medição
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem decidir encerramentos.' },
        { status: check.status },
      )
    }

    const rawParams = await params
    const paramsCheck = ParamsSchema.safeParse(rawParams)
    if (!paramsCheck.success) {
      return apiError('ID inválido.', { status: 400 })
    }
    const { id } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { acao, motivo_rejeicao } = parsed.data

    const resultado = await decidirSolicitacaoEncerramento({
      solicitacao_encerramento_id: id,
      acao,
      motivo_rejeicao,
      decidido_por_id: check.userId,
    })

    // Email pro Fornecedor (best-effort)
    void (async () => {
      try {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const admin = createAdminClient()

        const enc: any = (resultado as any).encerramento
        const solicitacaoFatDiretoId = enc?.solicitacao_fat_direto_id
        if (!solicitacaoFatDiretoId) return

        // Carrega dados do pedido + contrato
        const { data: pedido } = await admin
          .from('solicitacoes_fat_direto')
          .select(`
            id, numero_pedido_fip, valor_total, fornecedor_razao_social,
            fornecedor_email, fornecedor_contato_email, contrato_id,
            contrato:contrato_id(numero)
          `)
          .eq('id', solicitacaoFatDiretoId)
          .single()
        if (!pedido) return

        // Resolve email do fornecedor (várias fontes possíveis)
        const fornecedorEmail =
          (pedido as any).fornecedor_email ||
          (pedido as any).fornecedor_contato_email ||
          null

        // Resolve nome do decisor pra mostrar no email
        const { data: decisor } = await admin
          .from('perfis')
          .select('nome')
          .eq('id', check.userId)
          .single()

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fip-wave.vercel.app'
        const urlPedido = `${baseUrl}/contratos/${(pedido as any).contrato_id}/fat-direto/${solicitacaoFatDiretoId}`

        // Destinatários: fornecedor + admins do contrato (cópia)
        const { data: vinculos } = await admin
          .from('usuarios_contratos')
          .select('usuario_id, perfis:usuario_id(email, perfil)')
          .eq('contrato_id', (pedido as any).contrato_id)
        const adminsCc = ((vinculos ?? []) as any[])
          .filter(v => v.perfis?.perfil === 'admin' && v.perfis?.email)
          .map(v => v.perfis.email as string)

        const destinatarioPrimario = fornecedorEmail || adminsCc[0]
        if (!destinatarioPrimario) {
          log.warn('encerramento_saldo_decidido_sem_destinatario', {
            solicitacao_encerramento_id: id,
          })
          return
        }

        const cc = adminsCc.filter(e => e !== destinatarioPrimario)

        const numeroPedido = (pedido as any).numero_pedido_fip ?? null
        const contratoNumero = (pedido as any).contrato?.numero ?? '—'
        const fornecedorRazao = (pedido as any).fornecedor_razao_social ?? '—'
        const valorPedido = Number((pedido as any).valor_total || 0)
        const decididoEm = enc.decidido_em
        const decididoPorNome = decisor?.nome ?? '—'

        let tpl
        if (acao === 'aprovar') {
          tpl = templateEncerramentoSaldoAprovado({
            numero_pedido_fip: numeroPedido,
            contrato_numero: contratoNumero,
            fornecedor_razao_social: fornecedorRazao,
            valor_pedido: valorPedido,
            saldo_cancelado: Number(enc.saldo_efetivamente_cancelado || enc.saldo_no_momento || 0),
            motivo_solicitacao: enc.motivo_solicitacao,
            decidido_por_nome: decididoPorNome,
            decidido_em: decididoEm,
            url_pedido: urlPedido,
          })
        } else {
          tpl = templateEncerramentoSaldoRejeitado({
            numero_pedido_fip: numeroPedido,
            contrato_numero: contratoNumero,
            fornecedor_razao_social: fornecedorRazao,
            saldo_solicitado: Number(enc.saldo_no_momento || 0),
            motivo_rejeicao: enc.motivo_rejeicao || motivo_rejeicao || '—',
            decidido_por_nome: decididoPorNome,
            decidido_em: decididoEm,
            url_pedido: urlPedido,
          })
        }

        await sendEmail({
          to: destinatarioPrimario,
          cc: cc.length > 0 ? cc : undefined,
          subject: tpl.subject,
          html: tpl.html,
          tipo: acao === 'aprovar' ? 'aprovado' : 'rejeitado',
        })

        log.info('encerramento_saldo_decisao_email_enviado', {
          solicitacao_encerramento_id: id,
          acao,
        })
      } catch (e: any) {
        log.warn('encerramento_saldo_decisao_email_falhou', {
          solicitacao_encerramento_id: id,
          error: e?.message,
        })
      }
    })()

    return NextResponse.json(resultado)
  } catch (e: any) {
    // EncerramentoError vem de encerrarSolicitacao() (NF pendente etc.)
    if (e instanceof EncerramentoError) {
      return NextResponse.json(
        { error: e.message, code: e.code, detail: e.detail },
        { status: e.code === 'NAO_PERMITIDO' ? 403 : 422 },
      )
    }
    const msg = e?.message || ''
    if (
      msg.includes('Solicitação não encontrada') ||
      msg.includes('já foi decidida') ||
      msg.includes('Motivo de rejeição obrigatório') ||
      msg.includes('Rejeite esta solicitação')
    ) {
      // 409: o estado do pedido/solicitação conflita com a ação pedida —
      // o aprovador precisa rejeitar em vez de aprovar.
      const isConflict = msg.includes('já foi decidida') || msg.includes('Rejeite esta solicitação')
      return apiError(e, { status: isConflict ? 409 : 400 })
    }
    return apiError(e)
  }
}
