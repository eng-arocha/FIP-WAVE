import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mesclarMaximoPorPavto } from '@/lib/pavimentos'

/**
 * GET /api/contratos/[id]/medicoes/acumulado
 *
 * Retorna o acumulado por detalhamento de TODAS as medicoes APROVADAS
 * deste contrato. Resposta:
 *
 *   { [detalhamento_id]: { qtde, qtde_contratada, pct, pavimentos_pct } }
 *
 * - qtde:            soma absoluta de quantidade_medida (sem arredondamento)
 * - qtde_contratada: limite contratual do detalhamento
 * - pct:             qtde / qtde_contratada × 100 (informativo, ate 2 casas)
 * - pavimentos_pct:  MAX por pavto entre todas medicoes aprovadas (so para
 *                    itens PAV TIPO; null caso contrario). Cf. migration 066.
 *
 * Usado pelo form de Nova Medicao pra:
 *   1) bloquear qtde minima na UI (= acumulado anterior)
 *   2) calcular delta = qtde_solicitada - qtde_acumulada
 *   3) seedar o estado inicial da grade de pavimentos (PAV TIPO)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // Pega ids de medicoes aprovadas, depois busca itens via in()
    // (evita o filtro 'medicoes.contrato_id' que requer FK relacionado).
    const { data: meds } = await admin
      .from('medicoes')
      .select('id')
      .eq('contrato_id', id)
      .eq('status', 'aprovado')
    const medIds = (meds || []).map((m: any) => m.id)
    if (medIds.length === 0) return NextResponse.json({})

    // pavimentos_pct so existe apos migration 066; tenta com a coluna, faz
    // fallback se a migration ainda nao rodou.
    const colsComPav = 'detalhamento_id, quantidade_medida, pavimentos_pct, detalhamento:detalhamentos(quantidade_contratada)'
    const colsSemPav = 'detalhamento_id, quantidade_medida, detalhamento:detalhamentos(quantidade_contratada)'
    let itens: any[] | null = null
    const primary = await admin
      .from('medicao_itens')
      .select(colsComPav)
      .in('medicao_id', medIds)
      .not('detalhamento_id', 'is', null)
    if (primary.error && (
      (primary.error as any).code === 'PGRST204' ||
      String((primary.error as any).message || '').includes('pavimentos_pct')
    )) {
      const fb = await admin
        .from('medicao_itens')
        .select(colsSemPav)
        .in('medicao_id', medIds)
        .not('detalhamento_id', 'is', null)
      itens = fb.data as any[] | null
    } else {
      itens = primary.data as any[] | null
    }

    return NextResponse.json(buildMap(itens || []))
  } catch (e: any) {
    return NextResponse.json({}, { status: 200 })
  }
}

interface AcumuladoEntry {
  qtde: number
  qtde_contratada: number
  pct: number
  /** Pct acumulado por pavto (so itens PAV TIPO; null caso contrario). */
  pavimentos_pct: Record<string, number> | null
}

function buildMap(itens: any[]): Record<string, AcumuladoEntry> {
  const sumQtd: Record<string, number> = {}
  const contratada: Record<string, number> = {}
  const pavtoMax: Record<string, Record<string, number> | null> = {}

  for (const it of itens) {
    if (!it.detalhamento_id) continue
    sumQtd[it.detalhamento_id] = (sumQtd[it.detalhamento_id] || 0) + Number(it.quantidade_medida || 0)
    const qc = Number(it.detalhamento?.quantidade_contratada ?? 0)
    if (qc > 0) contratada[it.detalhamento_id] = qc
    // Pct acumulado eh monotonico crescente por pavto; mesclar via MAX cobre
    // tambem o caso de medicoes desordenadas.
    if (it.pavimentos_pct && typeof it.pavimentos_pct === 'object') {
      pavtoMax[it.detalhamento_id] = mesclarMaximoPorPavto(
        pavtoMax[it.detalhamento_id] || null,
        it.pavimentos_pct as Record<string, number>,
      )
    }
  }

  const result: Record<string, AcumuladoEntry> = {}
  for (const id of Object.keys(sumQtd)) {
    const qc = contratada[id] || 1
    const qtde = sumQtd[id]
    const pct = qc > 0 ? Math.min(100, Math.round((qtde / qc) * 10000) / 100) : 0
    result[id] = { qtde, qtde_contratada: qc, pct, pavimentos_pct: pavtoMax[id] || null }
  }
  return result
}
