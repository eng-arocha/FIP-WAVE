/**
 * Variáveis de ambiente do Supabase com sanitização agressiva.
 *
 * Motivação: já vimos a chave anon do Vercel chegando com `\r\n` no fim,
 * o que faz o Realtime/REST rejeitar a auth (WebSocket fecha; PostgREST
 * devolve 401 sem mensagem útil). Como JWT é base64url, NENHUM whitespace
 * é legítimo — então removemos qualquer um (inclusive no meio, defesa
 * contra paste com newline acidental).
 */
let warned = false

function sanitize(name: string, value: string | undefined): string {
  const raw = value ?? ''
  // Remove todos os whitespace (space, tab, CR, LF, NBSP, zero-width, etc.)
  const clean = raw.replace(/\s+/g, '')
  if (clean.length !== raw.length && !warned && typeof console !== 'undefined') {
    warned = true
    // Avisa uma vez no console (ambos client e server) pra ajudar a
    // diagnosticar — não vaza o valor, só o nome e o tipo do char removido.
    const removed = raw.length - clean.length
    console.warn(
      `[supabase/env] ${name} continha ${removed} caractere(s) de whitespace — removidos. ` +
      `Considere corrigir a env var no Vercel para evitar essa correção em runtime.`,
    )
  }
  return clean
}

export function getSupabaseUrl(): string {
  return sanitize('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function getSupabaseAnonKey(): string {
  return sanitize('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function getSupabaseServiceRoleKey(): string {
  return sanitize('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)
}
