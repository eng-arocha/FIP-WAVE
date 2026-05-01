import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { templateRelatorioMensal } from '@/lib/email/templates-relatorio-mensal'
import { sendEmail } from '@/lib/email/send'
import { listarUsuariosAtreladosAoContrato } from '@/lib/db/usuarios-contrato'

/**
 * GET /api/relatorios-mensais/[id]
 *
 * Retorna detalhes do relatório (snapshot dos pedidos) + preview
 * renderizado do email + lista de envolvidos do contrato.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })

    const { id } = await params
    const admin = createAdminClient()
    const { data: rel } = await admin
      .from('relatorios_mensais_fat_direto')
      .select(`
        id, contrato_id, ano, mes, pedidos_snapshot, qtd_pedidos,
        valor_total_atrasado, sequencia_cobranca, status, gerado_em, enviado_em,
        contrato:contratos ( id, numero, descricao )
      `)
      .eq('id', id)
      .single()
    if (!rel) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })

    const tpl = templateRelatorioMensal({
      numero_contrato: ((rel as any).contrato as any).numero,
      ano: (rel as any).ano,
      mes: (rel as any).mes,
      sequencia_cobranca: (rel as any).sequencia_cobranca,
      qtd_pedidos: (rel as any).qtd_pedidos,
      valor_total_atrasado: Number((rel as any).valor_total_atrasado),
      pedidos: ((rel as any).pedidos_snapshot || []) as any[],
    })

    const envolvidos = await listarUsuariosAtreladosAoContrato((rel as any).contrato_id)

    return NextResponse.json({
      relatorio: rel,
      preview: tpl,
      envolvidos: envolvidos.map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil })),
    })
  } catch (e: any) {
    return apiError(e)
  }
}

const PostBody = z.object({
  acao: z.enum(['enviar', 'descartar']),
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

/**
 * POST /api/relatorios-mensais/[id]
 *
 * Ação 'enviar': dispara o email pros destinatários selecionados +
 * marca status='enviado'. Idempotente — se já enviado, recusa.
 * Ação 'descartar': marca status='descartado' (gestor decidiu não enviar).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) return NextResponse.json({ error: 'Sem permissão.' }, { status: check.status })

    const parsed = await parseBody(PostBody, req)
    if (!parsed.ok) return parsed.res
    const { acao, destinatarios_ids } = parsed.data
    const { id } = await params

    const admin = createAdminClient()
    const { data: rel } = await admin
      .from('relatorios_mensais_fat_direto')
      .select(`
        id, contrato_id, ano, mes, pedidos_snapshot, qtd_pedidos,
        valor_total_atrasado, sequencia_cobranca, status,
        contrato:contratos ( numero )
      `)
      .eq('id', id)
      .single()
    if (!rel) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 })
    if ((rel as any).status !== 'pendente') {
      return NextResponse.json({ error: `Relatório já está '${(rel as any).status}'.` }, { status: 400 })
    }

    if (acao === 'descartar') {
      await admin
        .from('relatorios_mensais_fat_direto')
        .update({ status: 'descartado', updated_at: new Date().toISOString() })
        .eq('id', id)
      await audit({
        event: 'relatorio_mensal.descartado',
        entity_type: 'relatorio_mensal_fat_direto',
        entity_id: id,
        actor_id: check.userId,
        actor_email: check.userEmail ?? null,
        request: req,
      })
      return NextResponse.json({ ok: true, status: 'descartado' })
    }

    // acao === 'enviar'
    if (!destinatarios_ids || destinatarios_ids.length === 0) {
      return NextResponse.json({ error: 'Selecione ao menos 1 destinatário.' }, { status: 400 })
    }

    const envolvidos = await listarUsuariosAtreladosAoContrato((rel as any).contrato_id)
    const emails = envolvidos
      .filter(u => destinatarios_ids.includes(u.id))
      .map(u => u.email)
      .filter(Boolean) as string[]
    if (emails.length === 0) {
      return NextResponse.json({ error: 'Nenhum destinatário válido.' }, { status: 400 })
    }

    const tpl = templateRelatorioMensal({
      numero_contrato: ((rel as any).contrato as any).numero,
      ano: (rel as any).ano,
      mes: (rel as any).mes,
      sequencia_cobranca: (rel as any).sequencia_cobranca,
      qtd_pedidos: (rel as any).qtd_pedidos,
      valor_total_atrasado: Number((rel as any).valor_total_atrasado),
      pedidos: ((rel as any).pedidos_snapshot || []) as any[],
    })

    const r = await sendEmail({
      to: emails,
      subject: tpl.subject,
      html: tpl.html,
      tipo: 'lembrete',
    })

    await admin
      .from('relatorios_mensais_fat_direto')
      .update({
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        enviado_por_id: check.userId ?? null,
        destinatarios_emails: emails,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    await audit({
      event: 'relatorio_mensal.enviado',
      entity_type: 'relatorio_mensal_fat_direto',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: {
        contrato_id: (rel as any).contrato_id,
        sequencia_cobranca: (rel as any).sequencia_cobranca,
        qtd_pedidos: (rel as any).qtd_pedidos,
        emails,
        send_success: r.success,
      },
      request: req,
    })

    return NextResponse.json({ ok: true, status: 'enviado', email_enviado: r.success, emails })
  } catch (e: any) {
    return apiError(e)
  }
}
