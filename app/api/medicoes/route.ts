import { NextRequest, NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { sendEmail } from '@/lib/email/send'
import { templateNovaMedicao } from '@/lib/email/templates'

export async function POST(request: NextRequest) {
  const negado = await requirePermissao('medicoes', 'criar')
  if (negado) return negado
  try {
    const body = await request.json()
    const { medicao, contrato, aprovadores_emails } = body

    // Enviar e-mail para aprovadores
    for (const email of aprovadores_emails) {
      const template = templateNovaMedicao(medicao, contrato)
      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erro ao processar medição:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
