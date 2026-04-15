import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Provider de email: Brevo (ex-Sendinblue).
 *
 * Usa a API HTTP v3 direto via fetch (sem SDK) — evita dependência extra
 * e funciona em edge/Node runtimes indistintamente.
 *
 * Env vars:
 *   BREVO_API_KEY         — API key (xkeysib-...)
 *   FROM_EMAIL            — email do sender verificado no Brevo
 *   FROM_NAME (opcional)  — nome do remetente (default: "Gestão WAVE · FIP-WAVE")
 *
 * Pré-requisito no Brevo:
 *   - FROM_EMAIL precisa ser um Sender verificado (Brevo → Senders → Add)
 *   - Brevo manda email de confirmação; depois verificado, pode mandar
 *     pra qualquer destinatário externo (gmail, corporativos, etc.)
 */

const FROM_EMAIL = process.env.FROM_EMAIL || 'alex.rocha@dasart.com.br'
const FROM_NAME = process.env.FROM_NAME || 'WAVE'
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email'

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
 * Tenta enviar imediatamente via Brevo. Em caso de falha, grava na
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

/** Tentativa real de envio via Brevo. Atualiza o log conforme resultado. */
async function tentarEnvio(
  payload: { to: string[]; cc?: string[]; subject: string; html: string; tipo: string; medicao_id?: string },
  logId: string | undefined,
  tentativaAtual: number,
): Promise<SendResult> {
  const admin = createAdminClient()

  const brevoApiKey = process.env.BREVO_API_KEY
  if (!brevoApiKey) {
    const errMsg = 'BREVO_API_KEY não configurada nas env vars.'
    // eslint-disable-next-line no-console
    console.error(errMsg)
    if (logId) {
      await admin.from('notificacoes_log').update({
        status_envio: 'falhou',
        tentativas: tentativaAtual + 1,
        ultimo_erro: errMsg,
      }).eq('id', logId)
    }
    return { success: false, error: errMsg, logId }
  }

  const brevoBody = {
    sender: { email: FROM_EMAIL, name: FROM_NAME },
    to: payload.to.map(e => ({ email: e })),
    cc: payload.cc?.map(e => ({ email: e })),
    subject: payload.subject,
    htmlContent: payload.html,
    // Tag facilita tracking no dashboard do Brevo
    tags: [`fip-wave-${payload.tipo}`],
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(brevoBody),
    })

    if (!res.ok) {
      const errBody = await res.text()
      const errMsg = `Brevo ${res.status}: ${errBody.slice(0, 500)}`
      // eslint-disable-next-line no-console
      console.error('Brevo rejeitou:', { status: res.status, body: errBody, from: FROM_EMAIL, to: payload.to })

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

    const data = await res.json() as { messageId?: string }
    const messageId = data.messageId ?? null

    if (logId) {
      await admin.from('notificacoes_log').update({
        status_envio: 'enviado',
        message_id: messageId,
        sent_at: new Date().toISOString(),
        tentativas: tentativaAtual + 1,
        proximo_retry_em: null,
        ultimo_erro: null,
      }).eq('id', logId)
    }
    return { success: true, messageId: messageId ?? undefined, logId }
  } catch (error) {
    const msg = String(error)
    // eslint-disable-next-line no-console
    console.error('Erro ao enviar via Brevo (exception):', error)
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
