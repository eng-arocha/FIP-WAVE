import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { aprovarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada } from '@/lib/email/templates'

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

    const { medicaoId } = await params
    const { comentario, medicao } = await req.json()

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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
