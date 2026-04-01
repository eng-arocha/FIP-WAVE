import { NextResponse } from 'next/server'
import { rejeitarMedicao } from '@/lib/db/medicoes'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoRejeitada } from '@/lib/email/templates'

export async function POST(req: Request, { params }: { params: Promise<{ medicaoId: string }> }) {
  try {
    const { medicaoId } = await params
    const { aprovadorNome, aprovadorEmail, motivo, medicao } = await req.json()
    await rejeitarMedicao(medicaoId, aprovadorNome, aprovadorEmail, motivo)
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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
