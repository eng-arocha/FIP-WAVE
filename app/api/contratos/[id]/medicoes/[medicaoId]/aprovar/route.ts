import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { aprovarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada } from '@/lib/email/templates'
import { templateLiberacaoMedicaoFornecedor } from '@/lib/email/templates-medicoes'
import { calcularResumoFinanceiroObra } from '@/lib/db/resumo-financeiro-obra'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { emitWebhook } from '@/lib/api/webhooks'
import { assertMfaForRole } from '@/lib/api/mfa'
import { log } from '@/lib/log'

const Body = z.object({
  comentario: z.string().max(2000).optional().default(''),
  // Payload opcional usado apenas pra compor o email original — validação leve.
  medicao: z.any().optional(),
  /** Se true e destinatarios_ids preenchido, dispara também o email de
   *  Liberação para NF (template novo, com resumo financeiro consolidado). */
  notificar_envolvidos: z.boolean().optional(),
  destinatarios_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    // SEGURANÇA: exige autenticação E permissão `medicoes.aprovar`.
    // O nome/email do aprovador é derivado da SESSÃO, não do body — impede
    // que qualquer cliente forje a identidade de outro usuário.
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem aprovar medições.' },
        { status: check.status }
      )
    }

    // P1.10: MFA obrigatório pra aprovação (quando MFA_ENFORCED=true).
    // Sem feature flag, retorna ok=true. Com flag, exige aal2.
    const mfa = await assertMfaForRole('aprovador')
    if (!mfa.ok) {
      return NextResponse.json({ error: mfa.reason, code: 'MFA_REQUIRED' }, { status: 403 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { comentario, medicao, notificar_envolvidos, destinatarios_ids } = parsed.data
    const { id: contratoId, medicaoId } = await params

    // Recupera nome do aprovador a partir do perfil (não confia no body)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: perfilAprovador } = await admin
      .from('perfis')
      .select('nome, email')
      .eq('id', check.userId)
      .single()

    const aprovadorNome  = perfilAprovador?.nome  ?? check.userEmail ?? 'Aprovador'
    const aprovadorEmail = perfilAprovador?.email ?? check.userEmail ?? ''

    await aprovarMedicao(medicaoId, aprovadorNome, aprovadorEmail, comentario)

    await audit({
      event: 'medicao.aprovada',
      entity_type: 'medicao',
      entity_id: medicaoId,
      actor_id: check.userId,
      actor_nome: aprovadorNome,
      actor_email: aprovadorEmail,
      metadata: { comentario: comentario || null },
      request: req,
    })

    // Webhook outbound (best-effort, não bloqueia resposta)
    void emitWebhook('medicao.aprovada', {
      medicao_id: medicaoId,
      aprovador: { nome: aprovadorNome, email: aprovadorEmail },
      comentario: comentario || null,
    })

    // Email original (mantido pra compatibilidade — vai pro solicitante)
    if (medicao?.contrato) {
      const tpl = templateMedicaoAprovada(medicao, medicao.contrato, comentario)
      await sendEmail({
        to: medicao.solicitante_email,
        cc: [medicao.contrato.contratante?.email_contato, medicao.contrato.contratado?.email_contato].filter(Boolean) as string[],
        subject: tpl.subject,
        html: tpl.html,
      }).catch(() => null)
    }

    // Email NOVO de Liberação para NF (com resumo financeiro consolidado),
    // disparado apenas se admin marcou "Notificar envolvidos" e selecionou
    // destinatários. Não bloqueia o response em caso de falha.
    let emailLiberacao: { ok: boolean; qtd?: number; erro?: string } = { ok: false }
    if (notificar_envolvidos && (destinatarios_ids?.length ?? 0) > 0) {
      try {
        emailLiberacao = await dispararEmailLiberacaoMedicao({
          contratoId,
          medicaoId,
          aprovadorNome,
          destinatariosIds: destinatarios_ids!,
        })
      } catch (e: any) {
        log.warn('email_liberacao_medicao_falhou', { medicaoId, error: e?.message })
        emailLiberacao = { ok: false, erro: e?.message || 'falha ao enviar' }
      }
    }

    return NextResponse.json({ ok: true, email_liberacao: emailLiberacao })
  } catch (e: any) {
    return apiError(e)
  }
}

/**
 * Dispara o email NOVO de Liberação de Medição pra emissão de NF.
 * Inclui o bloco de Resumo Financeiro da Obra (acumulado + período + retenção).
 */
async function dispararEmailLiberacaoMedicao(args: {
  contratoId: string
  medicaoId: string
  aprovadorNome: string
  destinatariosIds: string[]
}): Promise<{ ok: boolean; qtd?: number; erro?: string }> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // Carrega medição com itens + contrato pra montar o template
  const { data: med } = await admin
    .from('medicoes')
    .select(`
      id, numero, periodo_referencia, valor_total, observacoes, data_aprovacao,
      contrato:contrato_id ( id, numero ),
      medicao_itens (
        quantidade_medida, valor_medido,
        detalhamento:detalhamentos ( codigo, descricao )
      )
    `)
    .eq('id', args.medicaoId)
    .single()

  if (!med) return { ok: false, erro: 'medição não encontrada' }

  // Resolve emails dos destinatários (valida vínculo com o contrato)
  const { data: vinculos } = await admin
    .from('usuarios_contratos')
    .select('usuario_id, perfis:usuario_id(id, email, nome)')
    .eq('contrato_id', args.contratoId)
    .in('usuario_id', args.destinatariosIds)

  const emails: string[] = []
  for (const v of (vinculos || []) as any[]) {
    const e = v.perfis?.email
    if (e) emails.push(e)
  }
  if (emails.length === 0) return { ok: false, erro: 'nenhum destinatário válido' }

  const resumo = await calcularResumoFinanceiroObra({
    contrato_id: args.contratoId,
    medicao_id: args.medicaoId,
  })

  const tpl = templateLiberacaoMedicaoFornecedor({
    numero_medicao: (med as any).numero,
    periodo_referencia: (med as any).periodo_referencia ?? '—',
    data_aprovacao: (med as any).data_aprovacao ?? new Date().toISOString(),
    contrato_numero: (med as any).contrato?.numero ?? null,
    itens: ((med as any).medicao_itens || []).map((it: any) => ({
      codigo: it.detalhamento?.codigo ?? null,
      descricao: it.detalhamento?.descricao ?? '',
      qtde: it.quantidade_medida ?? null,
      valor_total: Number(it.valor_medido || 0),
    })),
    observacoes: (med as any).observacoes,
    resumo,
    aprovador_nome: args.aprovadorNome,
    reenvio: false,
  })

  const envio = await sendEmail({
    to: emails,
    subject: tpl.subject,
    html: tpl.html,
    tipo: 'aprovado',
  })
  if (!envio.success) return { ok: false, qtd: emails.length, erro: envio.error || 'Falha ao enviar' }

  log.info('email_liberacao_medicao_enviado', {
    medicaoId: args.medicaoId,
    qtd: emails.length,
    saldo_retencao: resumo.retencao.valor,
  })
  return { ok: true, qtd: emails.length }
}
