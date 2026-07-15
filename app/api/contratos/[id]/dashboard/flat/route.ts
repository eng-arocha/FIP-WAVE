import { NextResponse } from 'next/server'
import { getDashboardFlat } from '@/lib/db/dashboard'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/dashboard/flat
 *
 * Lista plana (todos os níveis, em ordem de árvore) da Visão Geral, para
 * o filtro por item e a exportação Excel/PDF. Reflete o estado atual —
 * sem cache.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params
    const flat = await getDashboardFlat(contratoId)
    return NextResponse.json({ itens: flat }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
