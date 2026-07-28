import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { conciliarMedicaoComInformakon } from '@/lib/db/medicao-conciliacao-informakon'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/conciliacao-informakon
 *
 * Compara a medição do FIP-WAVE contra o relatório do Informakon já
 * importado (migration 075) — ver `lib/db/medicao-conciliacao-informakon.ts`
 * para o cálculo. A página da medição usa isso pra avisar divergências ANTES
 * da aprovação (o gatilho foi a medição 04/2026 do WAVE, que só descobriu uma
 * divergência de R$ 11.541,44 depois da NF emitida).
 *
 * Nunca 500 por causa da conciliação em si: a função de cálculo já é
 * resiliente a tabelas/colunas ausentes e devolve `temDados: false`.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  // A conciliação expõe valores contratuais e de faturamento — exige o mesmo
  // nível de acesso da própria medição, nunca fica aberta.
  const negado = await requirePermissao('contratos', 'visualizar')
  if (negado) return negado

  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()
    const data = await conciliarMedicaoComInformakon(admin, contratoId, medicaoId)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
