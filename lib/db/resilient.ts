import { log } from '@/lib/log'

/**
 * Helper pra queries Supabase que precisam tolerar colunas/relacionamentos
 * que ainda não existem no schema cache (migration pendente).
 *
 * Problema que resolve:
 *   Hoje espalhamos o pattern:
 *     if (error && /coluna_a|coluna_b/.test(error.message)) {
 *       // fallback sem as colunas
 *     }
 *   Isso (a) duplica lógica (b) vaza nomes de coluna pro cliente
 *   via logs/retornos (c) é frágil a mudanças de mensagem do Postgres.
 *
 * Agora:
 *   const { data, error } = await withSchemaFallback({
 *     primary:  () => admin.from('perfis').select('id, nome, template_id, ...'),
 *     fallback: () => admin.from('perfis').select('id, nome, ...'),
 *     missingColumns: ['template_id', 'templates_permissao'],
 *     context: 'listarPerfis',
 *   })
 *
 * Detecta tanto PGRST204 ("column X does not exist") quanto PGRST200
 * ("could not find relationship") além do match por substring.
 */

type QueryResult<T> = { data: T | null; error: any }
type QueryFn<T> = () => PromiseLike<QueryResult<T>>

interface WithFallbackArgs<P, F> {
  primary: QueryFn<P>
  fallback: QueryFn<F>
  /**
   * Nomes de coluna/relação que, se aparecerem no erro, indicam schema
   * cache desatualizado — aí caímos pro fallback.
   */
  missingColumns: string[]
  /** Rótulo pra log — ex.: 'listarUsuarios', 'getPerfil'. */
  context: string
}

/**
 * Exportado para casos onde o `withSchemaFallback` (2 níveis) não serve —
 * ex.: 3 níveis de fallback, ou updates que só querem "ignorar se falhar
 * por coluna ausente". Use com moderação — prefira `withSchemaFallback`
 * quando der.
 */
export function isSchemaMissingError(err: any, cols: string[]): boolean {
  if (!err) return false
  const msg: string = err.message ?? ''
  const code: string = err.code ?? ''
  // Códigos conhecidos do PostgREST quando schema cache não conhece
  // uma coluna/relação:
  //   PGRST204 — column not found
  //   PGRST200 — relationship not found
  if (code === 'PGRST204' || code === 'PGRST200') return true
  // Fallback: substring match nas colunas esperadas.
  return cols.some(c => msg.includes(c))
}

export async function withSchemaFallback<P, F = P>(
  args: WithFallbackArgs<P, F>,
): Promise<QueryResult<P | F>> {
  const first = await args.primary()
  if (!first.error) return first as QueryResult<P | F>

  if (isSchemaMissingError(first.error, args.missingColumns)) {
    log.warn('schema_fallback_used', {
      context: args.context,
      missingColumns: args.missingColumns,
      originalError: first.error?.message,
    })
    return (await args.fallback()) as QueryResult<P | F>
  }

  return first as QueryResult<P | F>
}
