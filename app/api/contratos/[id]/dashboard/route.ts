import { NextResponse } from 'next/server'
import { getDashboardData } from '@/lib/db/dashboard'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/dashboard
 *
 * Devolve o payload `DashboardResponse` (ver `types/dashboard.ts`) com
 * agregados hierárquicos do contrato pra alimentar a tela de análise.
 *
 * Query params (todos opcionais — escolha o nível mais profundo):
 *   - grupo_id          → drill em nível 2 (tarefas do grupo)
 *   - tarefa_id         → drill em nível 3 (detalhamentos da tarefa)
 *   - detalhamento_id   → item único (nível 3)
 *   Sem params → nível 1 (todos os grupos macro do contrato).
 *
 * `runtime = 'nodejs'` é necessário porque usamos `createAdminClient()`
 * (service role); edge runtime não exporta o SUPABASE_SERVICE_ROLE_KEY.
 *
 * `dynamic = 'force-dynamic'` + Cache-Control no-store: o dashboard
 * reflete o estado atual de medições/NFs e não pode ser cacheado pelo
 * Vercel CDN.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params
    const url = new URL(req.url)
    const filtros = {
      grupo_id: url.searchParams.get('grupo_id') || undefined,
      tarefa_id: url.searchParams.get('tarefa_id') || undefined,
      detalhamento_id: url.searchParams.get('detalhamento_id') || undefined,
    }
    const data = await getDashboardData(contratoId, filtros)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return apiError(e)
  }
}
