/**
 * Logger estruturado mínimo — serve como fachada pra plugar Sentry,
 * Datadog, Axiom etc. no futuro sem tocar em cada call site.
 *
 * Princípios:
 * - No servidor (server components, route handlers): escreve sempre.
 *   Em dev, formato humano. Em prod, JSON line pra indexação.
 * - No browser: só `warn` e `error`. `info`/`debug` viram no-op pra
 *   não poluir o console do usuário final.
 * - Aceita (msg, ctx?) onde ctx é um objeto serializável.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogCtx = Record<string, unknown> | undefined

const isServer = typeof window === 'undefined'
const isProd = process.env.NODE_ENV === 'production'

function serializeError(e: unknown): Record<string, unknown> {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      // stack só em dev; em prod evitamos dump em logs públicos
      ...(isProd ? {} : { stack: e.stack }),
      ...((e as any).cause ? { cause: String((e as any).cause) } : {}),
    }
  }
  if (typeof e === 'object' && e !== null) return e as Record<string, unknown>
  return { value: String(e) }
}

function emit(level: LogLevel, msg: string, ctx: LogCtx) {
  // No-op em categorias silenciosas no client
  if (!isServer && (level === 'debug' || level === 'info')) return

  const payload = {
    level,
    msg,
    ts: new Date().toISOString(),
    ...(ctx ?? {}),
  }

  // Em produção: JSON line (amigável pra log aggregators)
  // Em dev: pretty-print pra ser legível no terminal
  const fn = level === 'error' ? console.error
           : level === 'warn'  ? console.warn
           : console.log

  if (isProd) {
    fn(JSON.stringify(payload))
  } else {
    fn(`[${level}]`, msg, ctx ?? '')
  }
}

export const log = {
  debug: (msg: string, ctx?: LogCtx) => emit('debug', msg, ctx),
  info:  (msg: string, ctx?: LogCtx) => emit('info',  msg, ctx),
  warn:  (msg: string, ctx?: LogCtx) => emit('warn',  msg, ctx),
  error: (msg: string, e?: unknown, ctx?: LogCtx) => {
    emit('error', msg, { ...(ctx ?? {}), error: e ? serializeError(e) : undefined })
    // Encaminha pra Sentry quando habilitado. Import dinâmico evita
    // adicionar peso ao bundle quando SDK não está em uso.
    if (isServer && process.env.SENTRY_DSN) {
      import('@sentry/nextjs').then(Sentry => {
        if (e instanceof Error) {
          Sentry.captureException(e, { extra: { msg, ...(ctx ?? {}) } })
        } else {
          Sentry.captureMessage(msg, { level: 'error', extra: { error: e, ...(ctx ?? {}) } })
        }
      }).catch(() => {/* sentry pkg ausente — no-op */})
    }
  },
}
