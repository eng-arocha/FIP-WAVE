/**
 * Paginação keyset (cursor-based) sobre Supabase.
 *
 * Por que keyset e não offset:
 *  - Offset (`.range(N, N+50)`) fica O(N) à medida que o usuário
 *    avança — a 10ª página de 50k registros consome muito.
 *  - Keyset usa o último valor visto (`cursor`) como WHERE → O(log N)
 *    via index. Performa igual na 1ª e na 1000ª página.
 *
 * API:
 *   const { rows, nextCursor } = await paginate(query, {
 *     orderBy: 'created_at', dir: 'desc', limit: 50, cursor
 *   })
 *
 * Uso típico em route handler:
 *   const { cursor, limit } = parsePageQuery(req)
 *   const q = admin.from('contratos').select('*').eq('status', 'ativo')
 *   return NextResponse.json(await paginate(q, { orderBy: 'created_at', cursor, limit }))
 */

export interface PaginateOptions {
  /** Coluna usada como cursor — DEVE ser indexada e única. Use 'id' como fallback. */
  orderBy: string
  /** 'asc' ou 'desc'. Default: 'desc'. */
  dir?: 'asc' | 'desc'
  /** Quantos itens por página. Default: 50. Max: 200. */
  limit?: number
  /** Valor do cursor (último valor visto). null/undefined = primeira página. */
  cursor?: string | null
  /** Coluna secundária pra desempate quando orderBy não é único. */
  secondaryOrderBy?: string
}

export interface PaginatedResult<T> {
  rows: T[]
  /** Cursor da próxima página (use no próximo request). null = última página. */
  nextCursor: string | null
  count: number
}

/**
 * Aplica paginação a um QueryBuilder do Supabase.
 *
 * NOTA: o builder não é tipado aqui (vem do supabase-js como qualquer
 * encadeamento). Aceitamos `any` na entrada e devolvemos T[] tipado.
 */
export async function paginate<T = any>(
  builder: any,
  opts: PaginateOptions,
): Promise<PaginatedResult<T>> {
  const dir = opts.dir ?? 'desc'
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const ascending = dir === 'asc'

  let q = builder.order(opts.orderBy, { ascending })
  if (opts.secondaryOrderBy) q = q.order(opts.secondaryOrderBy, { ascending })

  // Aplica filtro do cursor: pega itens "depois" do cursor na direção de ordenação
  if (opts.cursor) {
    q = ascending ? q.gt(opts.orderBy, opts.cursor) : q.lt(opts.orderBy, opts.cursor)
  }

  // limit + 1 pra detectar se tem próxima página sem segundo round-trip
  q = q.limit(limit + 1)

  const { data, error } = await q
  if (error) throw error

  const rows = (data ?? []) as any[]
  const hasMore = rows.length > limit
  const trimmed = hasMore ? rows.slice(0, limit) : rows
  const nextCursor = hasMore && trimmed.length > 0
    ? String((trimmed[trimmed.length - 1] as any)[opts.orderBy])
    : null

  return {
    rows: trimmed as T[],
    nextCursor,
    count: trimmed.length,
  }
}

/**
 * Helper pra extrair `cursor` e `limit` de query params da request.
 *   ?cursor=2024-01-01T00:00:00Z&limit=50
 */
export function parsePageQuery(req: Request): { cursor: string | null; limit: number } {
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Math.min(Math.max(Number(limitRaw) || 50, 1), 200) : 50
  return { cursor, limit }
}
