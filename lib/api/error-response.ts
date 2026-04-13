import { NextResponse } from 'next/server'
import { log } from '@/lib/log'

/**
 * Helper pra padronizar erros em route handlers de /app/api/.
 *
 * Problema que resolve:
 *   - Hoje espalhamos `NextResponse.json({ error: e.message }, { status: 500 })`
 *     por toda base. Isso vaza mensagens de Postgres/Supabase direto ao
 *     cliente (ex.: nome de coluna, stacktrace parcial, constraint name).
 *   - Em produção, atacantes podem fazer engenharia reversa do schema
 *     observando as mensagens que o servidor retorna.
 *
 * Estratégia:
 *   - Loga o erro completo no servidor (sempre — é o único lugar visível).
 *   - Retorna ao cliente uma mensagem segura:
 *       * 4xx: mensagem original (são erros de validação/permissão)
 *       * 5xx: mensagem genérica em prod; original em dev pra DX.
 *   - Em qualquer caso devolve `requestId` (timestamp curto) pra correlação.
 *
 * Uso típico:
 *   try { ... } catch (e) { return apiError(e) }
 *   return apiError('Campo obrigatório', { status: 400 })
 *   return apiError(e, { status: 400, context: { route: 'POST /usuarios' } })
 */

const isProd = process.env.NODE_ENV === 'production'

interface ApiErrorOptions {
  status?: number
  /** Contexto extra pro log (ex.: { route, userId, entityId }). */
  context?: Record<string, unknown>
  /** Força uma mensagem pública mesmo pra 5xx (útil em casos curados). */
  publicMessage?: string
}

function extractMessage(e: unknown): string {
  if (e == null) return 'Erro desconhecido'
  if (typeof e === 'string') return e
  if (e instanceof Error) return e.message
  if (typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string') {
    return (e as any).message
  }
  return 'Erro desconhecido'
}

function shortRequestId(): string {
  // Timestamp + ruído curto — suficiente pra correlacionar log com response.
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function apiError(e: unknown, opts: ApiErrorOptions = {}): NextResponse {
  const status = opts.status ?? 500
  const originalMessage = extractMessage(e)
  const requestId = shortRequestId()

  // Log sempre completo no servidor
  log.error('api_error', e, {
    status,
    requestId,
    ...(opts.context ?? {}),
  })

  // Decisão da mensagem pública
  let publicMessage: string
  if (opts.publicMessage) {
    publicMessage = opts.publicMessage
  } else if (status < 500) {
    // 4xx: mensagem real é útil (validação, permissão, conflito).
    publicMessage = originalMessage
  } else {
    // 5xx: em prod, não vaza detalhe de DB/stack. Em dev, ajuda a debug.
    publicMessage = isProd
      ? 'Erro interno. Tente novamente ou contate o suporte.'
      : originalMessage
  }

  return NextResponse.json(
    { error: publicMessage, requestId },
    { status }
  )
}
