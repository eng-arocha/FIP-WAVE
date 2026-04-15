import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const FROM_EMAIL = process.env.FROM_EMAIL || 'medicoes@fip-wave.com.br'
const FROM_NAME = 'FIP-WAVE · Controle de Medições'

interface SendEmailParams {
  to: string | string[]
  cc?: string | string[]
  subject: string
  html: string
  /** Tipo da notificação pra trilha (default: 'lembrete'). */
  tipo?: 'nova_medicao' | 'aprovado' | 'rejeitado' | 'ajuste_solicitado' | 'lembrete'
  /** ID da medição relacionada (opcional). */
  medicao_id?: string
}

interface SendResult { success: boolean; messageId?: string; error?: string; logId?: string }

/**
 * Backoff exponencial pras tentativas de retry.
 * Sequência: 1min, 5min, 15min, 1h, 6h.
 */
function backoffDelayMs(tentativas: number): number {
  const seq = [60_000, 300_000, 900_000, 3_600_000, 21_600_000]
  return seq[Math.min(tentativas, seq.length - 1)]
}

/**
 * Tenta enviar imediatamente via Resend. Em caso de falha, grava na
 * tabela notificacoes_log com retry agendado (cron processa depois).
 *
 * Sempre grava log — sucesso ou falha — pra ter trilha de auditoria
 * de cada email disparado pelo sistema.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const { to, cc, subject, html, tipo = 'lembrete', medicao_id } = params
  const toArr = Array.isArray(to) ? to : [to]
  const ccArr = cc ? (Array.isArray(cc) ? cc : [cc]) : undefined
  const payload = { to: toArr, cc: ccArr, subject, html, tipo, medicao_id }

  const admin = createAdminClient()

  // Registro inicial — status 'pendente'
  let logId: string | undefined
  try {
    const { data } = await admin
      .from('notificacoes_log')
      .insert({
        medicao_id: medicao_id ?? null,
        tipo,
        destinatario_email: toArr[0],
        assunto: subject,
        status_envio: 'pendente',
        payload,
        tentativas: 0,
      })
      .select('id')
      .single()
    logId = (data as any)?.id
  } catch {
    // Tabela pode não ter migration 034 ainda — segue sem log.
  }

  return await tentarEnvio(payload, logId, 0)
}

/** Tentativa real de envio. Atualiza o log conforme resultado. */
async function tentarEnvio(
  payload: { to: string[]; cc?: string[]; subject: string; html: string; tipo: string; medicao_id?: string },
  logId: string | undefined,
  tentativaAtual: number,
): Promise<SendResult> {
  const admin = createAdminClient()
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const result = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      html: payload.html,
    })

    // Resend SDK retorna {data, error} — NÃO joga exception quando rejeita.
    // Se result.error tem algo OU data.id é null, houve falha silenciosa.
    if (result.error || !result.data?.id) {
      const errMsg = result.error
        ? `Resend error: ${result.error.name || 'unknown'} - ${result.error.message || JSON.stringify(result.error)}`
        : 'Resend retornou sem message_id (rejeição silenciosa — provavelmente domínio FROM não verificado)'
      // eslint-disable-next-line no-console
      console.error('Resend rejeitou:', { error: result.error, data: result.data, from: FROM_EMAIL, to: payload.to })

      if (logId) {
        const proximaTentativa = tentativaAtual + 1
        const proximo_retry_em = proximaTentativa < 5
          ? new Date(Date.now() + backoffDelayMs(tentativaAtual)).toISOString()
          : null
        await admin.from('notificacoes_log').update({
          status_envio: proximaTentativa >= 5 ? 'falhou' : 'pendente',
          tentativas: proximaTentativa,
          proximo_retry_em,
          ultimo_erro: errMsg.slice(0, 1000),
        }).eq('id', logId)
      }
      return { success: false, error: errMsg, logId }
    }

    if (logId) {
      await admin.from('notificacoes_log').update({
        status_envio: 'enviado',
        message_id: result.data.id,
        sent_at: new Date().toISOString(),
        tentativas: tentativaAtual + 1,
        proximo_retry_em: null,
        ultimo_erro: null,
      }).eq('id', logId)
    }
    return { success: true, messageId: result.data.id, logId }
  } catch (error) {
    const msg = String(error)
    // eslint-disable-next-line no-console
    console.error('Erro ao enviar e-mail (exception):', error)
    if (logId) {
      const proximaTentativa = tentativaAtual + 1
      const proximo_retry_em = proximaTentativa < 5
        ? new Date(Date.now() + backoffDelayMs(tentativaAtual)).toISOString()
        : null
      await admin.from('notificacoes_log').update({
        status_envio: proximaTentativa >= 5 ? 'falhou' : 'pendente',
        tentativas: proximaTentativa,
        proximo_retry_em,
        ultimo_erro: msg.slice(0, 1000),
      }).eq('id', logId)
    }
    return { success: false, error: msg, logId }
  }
}

/**
 * Reprocessa uma notificação pendente. Usado pelo cron handler.
 * Lê o payload do log e tenta enviar.
 */
export async function reenviarNotificacao(logId: string): Promise<SendResult> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notificacoes_log')
    .select('id, tentativas, payload, status_envio')
    .eq('id', logId)
    .single()
  if (error || !data) return { success: false, error: 'log não encontrado' }
  const row = data as any
  if (row.status_envio === 'enviado') return { success: true, logId }
  if (!row.payload) return { success: false, error: 'sem payload pra reenviar' }
  return await tentarEnvio(row.payload, logId, row.tentativas ?? 0)
}
