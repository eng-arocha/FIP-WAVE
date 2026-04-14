import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { aprovarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada } from '@/lib/email/templates'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'
import { emitWebhook } from '@/lib/api/webhooks'

const Body = z.object({
  comentario: z.string().max(2000).optional().default(''),
  // Payload opcional usado apenas pra compor o email — validação leve.
  medicao: z.any().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ medicaoId: string }> }) {
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

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { comentario, medicao } = parsed.data
    const { medicaoId } = await params

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

    // Send email notification
    if (medicao?.contrato) {
      const tpl = templateMedicaoAprovada(medicao, medicao.contrato, comentario)
      await sendEmail({
        to: medicao.solicitante_email,
        cc: [medicao.contrato.contratante?.email_contato, medicao.contrato.contratado?.email_contato].filter(Boolean) as string[],
        subject: tpl.subject,
        html: tpl.html,
      }).catch(() => null) // don't fail if email fails
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
