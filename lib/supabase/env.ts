/**
 * Variáveis de ambiente do Supabase com .trim() defensivo.
 *
 * Motivação: já vimos chave anon do Vercel chegando com `\r\n` no final,
 * o que faz o Realtime/REST rejeitar a autenticação com erro críptico
 * (WebSocket fecha antes de estabelecer; PostgREST devolve 401 sem
 * mensagem útil). Trim aqui garante que qualquer copy-paste com newline
 * acidental no painel não quebra a app.
 *
 * Mantém comportamento anterior de não falhar no boot — se a env estiver
 * ausente, retorna string vazia e o cliente Supabase falhará de forma
 * mais explícita ao tentar usar.
 */
function readTrim(value: string | undefined): string {
  return (value ?? '').trim()
}

export function getSupabaseUrl(): string {
  return readTrim(process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function getSupabaseAnonKey(): string {
  return readTrim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

export function getSupabaseServiceRoleKey(): string {
  return readTrim(process.env.SUPABASE_SERVICE_ROLE_KEY)
}
