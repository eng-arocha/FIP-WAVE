import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { templateMedicaoAprovada, templateMedicaoRejeitada } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { acao, medicao, contrato, comentario, motivo, fornecedor_email, fiscal_email } = body

    let template

    if (acao === 'aprovado') {
      template = templateMedicaoAprovada(medicao, contrato, comentario)
      // Envia para fornecedor + cópia para o fiscal/FIP
      await sendEmail({
        to: fornecedor_email,
        cc: fiscal_email,
        subject: template.subject,
        html: template.html,
      })
    } else if (acao === 'rejeitado') {
      template = templateMedicaoRejeitada(medicao, contrato, motivo)
      await sendEmail({
        to: fornecedor_email,
        cc: fiscal_email,
        subject: template.subject,
        html: template.html,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao processar aprovação:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
