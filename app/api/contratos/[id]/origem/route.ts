// app/api/contratos/[id]/origem/route.ts
import { NextResponse } from 'next/server'
import { getOrigemPageData } from '@/lib/db/origem'
import { apiError } from '@/lib/api/error-response'
import type { DashboardModo } from '@/types/dashboard'
import type { OrigemTipo } from '@/types/origem'

/**
 * GET /api/contratos/[id]/origem
 *
 * Devolve o payload `OrigemResponse` (NFs ou pedidos/medições com saldo)
 * filtrado por modo, tipo de origem e escopo WBS.
 *
 * Query params (todos opcionais):
 *   - modo    → 'total' | 'material' | 'servico'  (default: 'total')
 *   - origem  → 'realizado' | 'saldo'              (default: 'realizado')
 *   - scope   → UUID; "" ou "null" → todos
 *
 * A lógica de fato vive em `lib/db/origem.ts` (`getOrigemPageData`),
 * compartilhada com a página Server Component.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params
    const url = new URL(req.url)

    const modoRaw = url.searchParams.get('modo') ?? 'total'
    const origemRaw = url.searchParams.get('origem') ?? 'realizado'
    const scopeRaw = url.searchParams.get('scope')
    const scopeId =
      scopeRaw === null || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw

    const modo: DashboardModo = (
      ['total', 'material', 'servico'] as const
    ).includes(modoRaw as DashboardModo)
      ? (modoRaw as DashboardModo)
      : 'total'

    const origem: OrigemTipo = origemRaw === 'saldo' ? 'saldo' : 'realizado'

    const data = await getOrigemPageData(contratoId, modo, origem, scopeId)
    return NextResponse.json(data, { headers: CACHE_HEADERS })
  } catch (e) {
    return apiError(e)
  }
}
