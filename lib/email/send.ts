import { Resend } from 'resend'

const FROM_EMAIL = process.env.FROM_EMAIL || 'medicoes@fip-wave.com.br'
const FROM_NAME = 'FIP-WAVE · Controle de Medições'

interface SendEmailParams {
  to: string | string[]
  cc?: string | string[]
  subject: string
  html: string
}

export async function sendEmail({ to, cc, subject, html }: SendEmailParams) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      subject,
      html,
    })
    return { success: true, messageId: result.data?.id }
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error)
    return { success: false, error: String(error) }
  }
}
