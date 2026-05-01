import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectarPedidosAtrasados } from '@/lib/db/fat-direto'
import { templatePedidosAtrasados } from '@/lib/email/templates-pedidos-atrasados'
import { sendEmail } from '@/lib/email/send'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'

/**
 * GET /api/contratos/[id]/fat-direto/pedidos-atrasados?ref={solId}
 *
 * Lista pedidos fat-direto aprovados ANTES da `solId` (pedido recém-cadastrado)
 * que ainda têm saldo pendente além do threshold de dias_alerta_pedido_atrasado
 * configurado no contrato (default 15).
 *
 * Usado pelo banner contextual após cadastro de NF: se devolver pedidos,
 * UI mostra alerta "N pedidos anteriores sem NF — Notificar FIP".
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })
    }

    const { id: contratoId } = await params
    const url = new URL(req.url)
    const refSolId = url.searchParams.get('ref')

    let dataReferencia: string | undefined
    if (refSolId) {
      const admin = createAdminClient()
      const { data: ref } = await admin
        .from('solicitacoes_fat_direto')
        .select('data_aprovacao')
        .eq('id', refSolId)
        .single()
      dataReferencia = (ref as any)?.data_aprovacao
    }

    const result = await detectarPedidosAtrasados({
      contrato_id: contratoId,
      data_referencia: dataReferencia,
    })

    return NextResponse.json(result)
  } catch (e: any) {
    return apiError(e)
  }
}

const PostBody = z.object({
  // Pedido recém-cadastrado (referência pra texto do email)
  ref_solicitacao_id: z.string().uuid(),
  numero_nf_recente: z.string().min(1),
  // dry_run=true: gera preview sem enviar
  dry_run: z.boolean().optional(),
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

/**
 * POST /api/contratos/[id]/fat-direto/pedidos-atrasados
 *
 * Gera preview ou envia email à FIP listando pedidos antigos pendentes.
 * Reutiliza GET pra calcular a lista; aqui monta o payload do email.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })
    }

    const parsed = await parseBody(PostBody, req)
    if (!parsed.ok) return parsed.res
    const { ref_solicitacao_id, numero_nf_recente, dry_run, destinatarios_ids } = parsed.data
    const { id: contratoId } = await params

    const admin = createAdminClient()

    // Carrega contrato + ref solicitação
    const { data: contrato } = await admin
      .from('contratos')
      .select('id, numero, descricao')
      .eq('id', contratoId)
      .single()
    if (!contrato) return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })

    const { data: ref } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, numero_pedido_fip, data_aprovacao')
      .eq('id', ref_solicitacao_id)
      .single()
    if (!ref) return NextResponse.json({ error: 'Pedido referência não encontrado.' }, { status: 404 })

    const result = await detectarPedidosAtrasados({
      contrato_id: contratoId,
      data_referencia: (ref as any).data_aprovacao,
    })

    if (result.pedidos.length === 0) {
      return NextResponse.json({ error: 'Nenhum pedido anterior pendente — nada a notificar.' }, { status: 400 })
    }

    const tpl = templatePedidosAtrasados({
      numero_contrato: (contrato as any).numero,
      numero_nf_recente,
      numero_pedido_recente: (ref as any).numero_pedido_fip ?? '—',
      data_aprov_pedido_recente: (ref as any).data_aprovacao,
      dias_alerta: result.dias_threshold,
      pedidos_atrasados: result.pedidos.map(p => ({
        numero_pedido_fip: p.numero_pedido_fip,
        data_aprovacao: p.data_aprovacao,
        valor_total: p.valor_total,
        total_nfs: p.total_nfs,
        saldo: p.saldo,
        dias_decorridos: p.dias_decorridos,
      })),
    })

    if (dry_run) {
      const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)
      return NextResponse.json({
        dry_run: true,
        preview: tpl,
        pedidos_atrasados: result.pedidos,
        dias_alerta: result.dias_threshold,
        envolvidos: envolvidos.map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil })),
      })
    }

    // Envio real
    let emailEnviado = false
    const destinos: string[] = []
    if (destinatarios_ids && destinatarios_ids.length > 0) {
      const envolvidos = await listarUsuariosAtreladosAoContrato(contratoId)
      const emails = envolvidos
        .filter(u => destinatarios_ids.includes(u.id))
        .map(u => u.email)
        .filter(Boolean) as string[]
      if (emails.length > 0) {
        const r = await sendEmail({
          to: emails,
          subject: tpl.subject,
          html: tpl.html,
          tipo: 'lembrete',
        })
        emailEnviado = r.success
        destinos.push(...emails)
      }
    }

    await audit({
      event: 'fat_direto.pedidos_atrasados_email_enviado',
      entity_type: 'contrato',
      entity_id: contratoId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: {
        ref_solicitacao_id,
        numero_nf_recente,
        qtd_pedidos: result.pedidos.length,
        email_enviado: emailEnviado,
        destinos,
      },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      email_enviado: emailEnviado,
      destinos,
      qtd_pedidos: result.pedidos.length,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
