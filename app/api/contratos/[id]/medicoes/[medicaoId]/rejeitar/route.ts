import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { rejeitarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoRejeitada } from '@/lib/email/templates'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

const Body = z.object({
  motivo: z.string().min(3, 'Informe o motivo (mín. 3 caracteres).').max(2000),
  medicao: z.any().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ medicaoId: string }> }) {
  try {
    // SEGURANÇA: exige autenticação E permissão `medicoes.aprovar`.
    // O nome/email do aprovador é derivado da SESSÃO, não do body.
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem rejeitar medições.' },
        { status: check.status }
      )
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { motivo, medicao } = parsed.data
    const { medicaoId } = await params

    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    const { data: perfilAprovador } = await admin
      .from('perfis')
      .select('nome, email')
      .eq('id', check.userId)
      .single()

    const aprovadorNome  = perfilAprovador?.nome  ?? check.userEmail ?? 'Aprovador'
    const aprovadorEmail = perfilAprovador?.email ?? check.userEmail ?? ''

    await rejeitarMedicao(medicaoId, aprovadorNome, aprovadorEmail, motivo)

    await audit({
      event: 'medicao.rejeitada',
      entity_type: 'medicao',
      entity_id: medicaoId,
      actor_id: check.userId,
      actor_nome: aprovadorNome,
      actor_email: aprovadorEmail,
      metadata: { motivo },
      request: req,
    })

    if (medicao?.contrato) {
      const tpl = templateMedicaoRejeitada(medicao, medicao.contrato, motivo)
      await sendEmail({
        to: medicao.solicitante_email,
        cc: [medicao.contrato.contratante?.email_contato, medicao.contrato.contratado?.email_contato].filter(Boolean) as string[],
        subject: tpl.subject,
        html: tpl.html,
      }).catch(() => null)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
