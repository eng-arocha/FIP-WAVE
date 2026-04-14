/**
 * Rate-limiting in-memory simples (token bucket).
 *
 * Quando usar:
 *  - Endpoints de integração externa (CNPJ via BrasilAPI) — proteger
 *    contra abuso e contra estouro de quota da terceira parte.
 *  - Endpoints de envio (email, parse-pedido) onde uma chamada custa
 *    recursos significativos.
 *
 * Limitações conscientes:
 *  - In-memory: cada instância serverless tem seu próprio contador.
 *    Numa Vercel com várias regiões/cold starts, o limite efetivo pode
 *    ser maior que o configurado. Pra rate-limit estrito (login,
 *    pagamento), trocar por @upstash/ratelimit + Redis.
 *  - Tolerável aqui porque o caso é "abuso médio", não fraude crítica.
 *
 * Uso:
 *   import { rateLimit } from '@/lib/api/rate-limit'
 *   const limit = rateLimit({ key: 'cnpj:' + ip, max: 10, windowMs: 60_000 })
 *   if (!limit.ok) return NextResponse.json({ error: 'Limite excedido' }, { status: 429 })
 */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// GC manual: sweep periódica a cada 10 min pra não vazar memória se chaves
// param de ser usadas
let lastSweep = Date.now()
function maybeSweep() {
  const now = Date.now()
  if (now - lastSweep < 10 * 60 * 1000) return
  lastSweep = now
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k)
  }
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
  retryAfterSec?: number
}

export function rateLimit(opts: { key: string; max: number; windowMs: number }): RateLimitResult {
  maybeSweep()
  const now = Date.now()
  const bucket = buckets.get(opts.key)
  if (!bucket || bucket.resetAt < now) {
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs }
    buckets.set(opts.key, fresh)
    return { ok: true, remaining: opts.max - 1, resetAt: fresh.resetAt }
  }
  if (bucket.count >= opts.max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }
  bucket.count++
  return { ok: true, remaining: opts.max - bucket.count, resetAt: bucket.resetAt }
}

/** Extrai IP de Request (Next.js) com fallback. */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
