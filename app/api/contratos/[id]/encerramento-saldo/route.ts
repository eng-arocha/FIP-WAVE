import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  criarSolicitacaoEncerramento,
  listarSolicitacoesPendentes,
} from '@/lib/db/encerramento-saldo'
import { apiError } from '@/lib/api/error-response'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { parseBody, uuid } from '@/lib/api/schema'
import { sendEmail } from '@/lib/email/send'
import { templateSolicitacaoEncerramentoSaldo } from '@/lib/email/templates-fat-direto'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/contratos/[id]/encerramento-saldo
 *   Cria uma solicitação de encerramento de saldo (Fornecedor → Aprovador).
 *   Body: { solicitacao_fat_direto_id, motivo?, medicao_origem_id? }
 *
 * GET /api/contratos/[id]/encerramento-saldo
 *   Lista solicitações pendentes do contrato.
 */

const PostBody = z.object({
  solicitacao_fat_direto_id: uuid(),
  motivo: z.string().trim().max(2000).optional(),
  medicao_origem_id: uuid().optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const negado = await requirePermissao('contratos', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId } = await params

    // Autenticação user-scoped (qualquer usuário com vínculo no contrato pode
    // SOLICITAR — a permissão restritiva é só na decisão, na rota PATCH).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError('Não autenticado.', { status: 401 })
    }

    const parsed = await parseBody(PostBody, req)
    if (!parsed.ok) return parsed.res
    const body = parsed.data

    const sol = await criarSolicitacaoEncerramento({
      solicitacao_fat_direto_id: body.solicitacao_fat_direto_id,
      motivo: body.motivo,
      solicitado_por_id: user.id,
      medicao_origem_id: body.medicao_origem_id,
    })

    // Carrega contexto extra pra resposta (descobrir o contrato_id efetivo
    // do pedido — defesa contra envio cruzado entre contratos)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: pedido } = await admin
      .from('solicitacoes_fat_direto')
      .select('contrato_id, numero_pedido_fip, valor_total, fornecedor_razao_social, nfs:notas_fiscais_fat_direto!solicitacao_id(valor, status)')
      .eq('id', body.solicitacao_fat_direto_id)
      .single()

    if (pedido && (pedido as any).contrato_id !== contratoId) {
      // Rollback: pedido não é desse contrato. Cancela a solicitação.
      await admin
        .from('solicitacoes_encerramento_saldo')
        .delete()
        .eq('id', (sol as any).id)
      return apiError('Pedido não pertence a este contrato.', { status: 400 })
    }

    // Email pro Aprovador (best-effort — falha não bloqueia o response)
    void (async () => {
      try {
        const { data: contratoInfo } = await admin
          .from('contratos')
          .select('numero, email_fiscal')
          .eq('id', contratoId)
          .single()

        // Destinatários: usuários vinculados ao contrato com perfil 'admin'.
        // Adiciona email_fiscal do contrato como fallback/cc.
        const { data: vinculos } = await admin
          .from('usuarios_contratos')
          .select('usuario_id, perfis:usuario_id(email, perfil)')
          .eq('contrato_id', contratoId)

        const destinatarios = ((vinculos ?? []) as any[])
          .filter(v => v.perfis?.perfil === 'admin' && v.perfis?.email)
          .map(v => v.perfis.email as string)

        if (contratoInfo?.email_fiscal && !destinatarios.includes(contratoInfo.email_fiscal)) {
          destinatarios.push(contratoInfo.email_fiscal)
        }

        if (destinatarios.length === 0) {
          log.warn('encerramento_saldo_sem_destinatario', { contratoId, solId: (sol as any).id })
          return
        }

        const { data: solicitante } = await admin
          .from('perfis')
          .select('nome, email')
          .eq('id', user.id)
          .single()

        const totalNfs = ((pedido as any)?.nfs ?? [])
          .filter((nf: any) => nfReservaSaldo(nf.status))
          .reduce((s: number, nf: any) => s + Number(nf.valor || 0), 0)

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://fip-wave.vercel.app'

        const tpl = templateSolicitacaoEncerramentoSaldo({
          numero_pedido_fip: (pedido as any)?.numero_pedido_fip ?? null,
          contrato_numero: contratoInfo?.numero ?? '—',
          fornecedor_razao_social: (pedido as any)?.fornecedor_razao_social ?? '—',
          valor_pedido: Number((pedido as any)?.valor_total || 0),
          total_nfs_lancadas: totalNfs,
          saldo_solicitado: Number((sol as any).saldo_no_momento || 0),
          motivo: (sol as any).motivo_solicitacao,
          solicitado_por_nome: solicitante?.nome ?? '—',
          solicitado_por_email: solicitante?.email ?? '',
          solicitado_em: (sol as any).solicitado_em,
          url_aprovacao: `${baseUrl}/contratos/${contratoId}/encerramentos`,
          contrato_id: contratoId,
        })

        await sendEmail({
          to: destinatarios,
          subject: tpl.subject,
          html: tpl.html,
          tipo: 'lembrete',
        })

        log.info('encerramento_saldo_email_enviado', {
          solId: (sol as any).id,
          destinatarios: destinatarios.length,
        })
      } catch (e: any) {
        log.warn('encerramento_saldo_email_falhou', {
          solId: (sol as any).id,
          error: e?.message,
        })
      }
    })()

    return NextResponse.json(sol, { status: 200 })
  } catch (e: any) {
    // Erros de regra (validação de saldo, status, duplicidade) viram 400/409
    const msg = e?.message || ''
    if (
      msg.includes('Pedido sem saldo') ||
      msg.includes('não pode ter saldo') ||
      msg.includes('Pedido deletado') ||
      msg.includes('Já existe solicitação')
    ) {
      const isConflict = msg.includes('Já existe solicitação')
      return apiError(e, { status: isConflict ? 409 : 400 })
    }
    return apiError(e)
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return apiError('Não autenticado.', { status: 401 })
    }

    const data = await listarSolicitacoesPendentes(contratoId)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
