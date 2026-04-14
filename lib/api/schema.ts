import { NextRequest, NextResponse } from 'next/server'
import { z, ZodError, ZodType } from 'zod'
import { apiError } from './error-response'

/**
 * Validação de entrada com Zod para route handlers.
 *
 * Uso típico:
 *   const Body = z.object({ nome: z.string().min(1), valor: z.number().positive() })
 *   export const POST = withSchema(Body, async (data, req) => {
 *     // data tipado como z.infer<typeof Body>
 *     return NextResponse.json({ ok: true })
 *   })
 *
 * Comportamento:
 *   - Tenta parsear o body como JSON. Se falhar, retorna 400 "Body inválido".
 *   - Valida contra o schema. Erros viram um 400 com { error, details[] }
 *     para que o frontend exiba erros campo-a-campo sem vazar stack/Supabase.
 *   - Em caso de sucesso, chama o handler com os dados tipados.
 *
 * Observação: para query params ou params dinâmicos de rota, use
 * `parseQuery` e `parseParams` exportados abaixo, que seguem o mesmo
 * padrão mas não consomem o body.
 */

type Ctx<P = any> = { params: Promise<P> }

export function withSchema<T>(
  schema: ZodType<T>,
  handler: (data: T, req: NextRequest, ctx: Ctx) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: Ctx) => {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return apiError('Body inválido: JSON malformado.', { status: 400 })
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return zodErrorResponse(parsed.error)
    return handler(parsed.data, req, ctx)
  }
}

/**
 * Parsear body JSON com schema Zod de forma INLINE (sem wrapper).
 *
 * Útil quando o handler precisa rodar lógica ANTES do parse — tipicamente
 * `assertPermissao`, que retorna 401/403 e não deveria acontecer depois
 * do parse. Evita a inversão de controle do `withSchema`.
 *
 * Uso:
 *   const body = await parseBody(MyBody, req)
 *   if (!body.ok) return body.res
 *   body.data // tipado
 */
export async function parseBody<T>(
  schema: ZodType<T>,
  req: Request | NextRequest,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, res: apiError('Body inválido: JSON malformado.', { status: 400 }) }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { ok: false, res: zodErrorResponse(parsed.error) }
  return { ok: true, data: parsed.data }
}

/** Valida query params (`req.nextUrl.searchParams`). */
export function parseQuery<T>(schema: ZodType<T>, req: NextRequest): { ok: true; data: T } | { ok: false; res: NextResponse } {
  const obj: Record<string, string> = {}
  req.nextUrl.searchParams.forEach((v, k) => { obj[k] = v })
  const parsed = schema.safeParse(obj)
  if (!parsed.success) return { ok: false, res: zodErrorResponse(parsed.error) }
  return { ok: true, data: parsed.data }
}

/** Valida route params (ex.: `/[id]`). */
export function parseParams<T>(schema: ZodType<T>, params: unknown): { ok: true; data: T } | { ok: false; res: NextResponse } {
  const parsed = schema.safeParse(params)
  if (!parsed.success) return { ok: false, res: zodErrorResponse(parsed.error) }
  return { ok: true, data: parsed.data }
}

function zodErrorResponse(err: ZodError): NextResponse {
  const details = err.issues.map(i => ({
    path: i.path.join('.'),
    code: i.code,
    message: i.message,
  }))
  return NextResponse.json(
    { error: 'Dados inválidos.', details },
    { status: 400 },
  )
}

// ── Primitivos reutilizáveis ────────────────────────────────────────

/** UUID v4 padrão Postgres. */
export const uuid = () => z.string().uuid('ID inválido (esperado UUID).')

/** CNPJ só dígitos — 14 chars. Aceita com máscara e limpa. */
export const cnpj = () =>
  z.string()
    .transform(v => v.replace(/\D/g, ''))
    .refine(v => v.length === 14, 'CNPJ deve ter 14 dígitos.')

/** CPF limpo. */
export const cpf = () =>
  z.string()
    .transform(v => v.replace(/\D/g, ''))
    .refine(v => v.length === 11, 'CPF deve ter 11 dígitos.')

/** Email com normalização lowercase. */
export const email = () =>
  z.string().email('Email inválido.').transform(v => v.trim().toLowerCase())

/** Valor monetário em reais, não-negativo, duas casas. */
export const valorMonetario = (opts: { min?: number; max?: number } = {}) =>
  z.number()
    .finite('Valor inválido.')
    .nonnegative('Valor não pode ser negativo.')
    .refine(v => opts.min === undefined || v >= opts.min, `Valor mínimo: ${opts.min}.`)
    .refine(v => opts.max === undefined || v <= opts.max, `Valor máximo: ${opts.max}.`)

/** Data no formato YYYY-MM-DD. */
export const dataIso = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve ser YYYY-MM-DD.')

/** Período YYYY-MM (usado em medicoes.periodo_referencia). */
export const periodoMes = () =>
  z.string().regex(/^\d{4}-\d{2}$/, 'Período deve ser YYYY-MM.')

// ── Schemas específicos de domínio (reuso entre endpoints) ──────────

export const statusMedicao = z.enum([
  'rascunho', 'submetido', 'em_analise', 'aprovado', 'rejeitado', 'cancelado',
])

export const statusSolicitacao = z.enum([
  'rascunho', 'aguardando_aprovacao', 'aprovado', 'rejeitado', 'cancelado',
])

export const acaoAprovacao = z.enum([
  'aprovado', 'rejeitado', 'solicitou_ajuste', 'comentou',
])
