import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { parseNFeWithRateLimit } from '@/lib/api/nfe-parser'

/**
 * POST /api/nfe/parse
 *
 * Body: { input: string }  — XML completo OU chave de 44 dígitos.
 * Resposta: ParsedNFe normalizada.
 *
 * Usado pra:
 *  - Auto-fill do formulário de NF (o usuário cola a chave ou faz upload do XML)
 *  - Pré-validação 3-way match: o frontend recebe emitente+CNPJ+valor antes de gravar
 *
 * Rate-limit: 30 req/min por IP (BrasilAPI tem quota agressiva).
 */
const Body = z.object({
  input: z.string().min(10, 'Forneça XML ou chave de 44 dígitos.').max(500_000),
})

export async function POST(req: Request) {
  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const result = await parseNFeWithRateLimit(parsed.data.input, req)
    return NextResponse.json(result)
  } catch (e: any) {
    if (e?.code === 'RATE_LIMIT') {
      return NextResponse.json(
        { error: e.message, retryAfter: e.retryAfterSec },
        { status: 429, headers: { 'Retry-After': String(e.retryAfterSec ?? 60) } },
      )
    }
    return apiError(e, { status: 400, publicMessage: e?.message ?? 'Falha ao parsear NFe.' })
  }
}
