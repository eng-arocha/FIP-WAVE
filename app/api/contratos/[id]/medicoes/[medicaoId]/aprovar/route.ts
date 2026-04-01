import { NextResponse } from 'next/server'
import { aprovarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada } from '@/lib/email/templates'

export async function POST(req: Request, { params }: { params: Promise<{ medicaoId: string }> }) {
  try {
    const { medicaoId } = await params
    const { aprovadorNome, aprovadorEmail, comentario, medicao } = await req.json()
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
