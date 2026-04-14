import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { log } from '@/lib/log'

/**
 * Webhooks outbound — dispara eventos de domínio para sistemas externos.
 *
 * Como funciona:
 *   1. emitWebhook(event, payload) busca todas subscriptions ativas
 *      que escutam esse `event` (ou ALL).
 *   2. Para cada subscription, cria uma webhook_delivery (status=pendente)
 *      e tenta enviar imediatamente.
 *   3. Em caso de falha, agenda retry com backoff exponencial.
 *      O cron `/api/cron/webhooks-retry` reprocessa pendentes.
 *
 * Segurança no destino:
 *   - Cada request tem header `X-FIP-Signature: sha256=<hex>` —
 *     HMAC-SHA256 do body com `subscription.secret`.
 *   - Cliente verifica que a request veio mesmo do FIP-WAVE.
 *
 * Não bloqueia o caller:
 *   - Erros são logados, não relançados. Webhooks são "best effort" —
 *     a operação de negócio principal já completou.
 */

interface WebhookPayload {
  event: string
  data: Record<string, unknown>
  timestamp: string
}

export async function emitWebhook(event: string, data: Record<string, unknown>): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: subs, error } = await admin
      .from('webhook_subscriptions')
      .select('id, url, secret, events')
      .eq('ativo', true)
    if (error || !subs) {
      // Tabela pode não existir ainda (migration 037 pendente)
      return
    }

    const elegiveis = subs.filter((s: any) => {
      const events: string[] = s.events ?? []
      return events.length === 0 || events.includes(event)
    })

    const payload: WebhookPayload = {
      event,
      data,
      timestamp: new Date().toISOString(),
    }
    const body = JSON.stringify(payload)

    for (const sub of elegiveis as any[]) {
      // Cria registro de delivery
      const { data: delivery } = await admin
        .from('webhook_deliveries')
        .insert({
          subscription_id: sub.id,
          event,
          payload,
          status: 'pendente',
        })
        .select('id')
        .single()
      const deliveryId = (delivery as any)?.id
      if (deliveryId) {
        // Dispara, mas não bloqueia o caller
        void deliverWebhook(sub, body, deliveryId, 0)
      }
    }
  } catch (e: any) {
    log.warn('emit_webhook_failed', { event, error: e?.message })
  }
}

function backoffMs(tentativa: number): number {
  const seq = [30_000, 120_000, 600_000, 1_800_000, 7_200_000]
  return seq[Math.min(tentativa, seq.length - 1)]
}

export async function deliverWebhook(
  sub: { id: string; url: string; secret: string },
  body: string,
  deliveryId: string,
  tentativaAtual: number,
): Promise<void> {
  const admin = createAdminClient()
  const sig = crypto.createHmac('sha256', sub.secret).update(body).digest('hex')
  const start = Date.now()
  let status_code: number | null = null
  let response_body = ''
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 10_000) // 10s timeout
    const res = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FIP-Signature': `sha256=${sig}`,
        'X-FIP-Delivery': deliveryId,
        'User-Agent': 'FIP-WAVE-Webhooks/1.0',
      },
      body,
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    status_code = res.status
    response_body = (await res.text()).slice(0, 2000)
    const duration_ms = Date.now() - start
    const sucesso = res.status >= 200 && res.status < 300

    await admin.from('webhook_deliveries').update({
      status: sucesso ? 'sucesso' : (tentativaAtual + 1 >= 5 ? 'falhou' : 'pendente'),
      status_code,
      response_body,
      duration_ms,
      tentativa: tentativaAtual + 1,
      proximo_retry: sucesso ? null : (tentativaAtual + 1 < 5 ? new Date(Date.now() + backoffMs(tentativaAtual)).toISOString() : null),
      enviado_em: new Date().toISOString(),
    }).eq('id', deliveryId)

    await admin.from('webhook_subscriptions').update({
      ultimo_envio: new Date().toISOString(),
      ultimo_status: status_code,
    }).eq('id', sub.id)
  } catch (e: any) {
    const duration_ms = Date.now() - start
    await admin.from('webhook_deliveries').update({
      status: tentativaAtual + 1 >= 5 ? 'falhou' : 'pendente',
      status_code,
      response_body: response_body || String(e?.message ?? e),
      duration_ms,
      tentativa: tentativaAtual + 1,
      proximo_retry: tentativaAtual + 1 < 5 ? new Date(Date.now() + backoffMs(tentativaAtual)).toISOString() : null,
      enviado_em: new Date().toISOString(),
    }).eq('id', deliveryId)
  }
}
