import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/contratos/[id]/medicoes/acumulado
 *
 * Retorna o acumulado por detalhamento de TODAS as medicoes APROVADAS
 * deste contrato. Resposta:
 *
 *   { [detalhamento_id]: { qtde: number, qtde_contratada: number, pct: number } }
 *
 * - qtde:            soma absoluta de quantidade_medida (sem arredondamento)
 * - qtde_contratada: limite contratual do detalhamento
 * - pct:             qtde / qtde_contratada × 100 (informativo, ate 2 casas)
 *
 * Usado pelo form de Nova Medicao pra:
 *   1) bloquear qtde minima na UI (= acumulado anterior)
 *   2) calcular delta = qtde_solicitada - qtde_acumulada
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

    const { data: itens } = await admin
      .from('medicao_itens')
      .select('detalhamento_id, quantidade_medida, detalhamento:detalhamentos(quantidade_contratada)')
      .in('medicao_id', medIds)
      .not('detalhamento_id', 'is', null)

    return NextResponse.json(buildMap(itens || []))
  } catch (e: any) {
    return NextResponse.json({}, { status: 200 })
  }
}

interface AcumuladoEntry {
  qtde: number
  qtde_contratada: number
  pct: number
}

function buildMap(itens: any[]): Record<string, AcumuladoEntry> {
  const sumQtd: Record<string, number> = {}
  const contratada: Record<string, number> = {}

  for (const it of itens) {
    if (!it.detalhamento_id) continue
    sumQtd[it.detalhamento_id] = (sumQtd[it.detalhamento_id] || 0) + Number(it.quantidade_medida || 0)
    const qc = Number(it.detalhamento?.quantidade_contratada ?? 0)
    if (qc > 0) contratada[it.detalhamento_id] = qc
  }

  const result: Record<string, AcumuladoEntry> = {}
  for (const id of Object.keys(sumQtd)) {
    const qc = contratada[id] || 1
    const qtde = sumQtd[id]
    const pct = qc > 0 ? Math.min(100, Math.round((qtde / qc) * 10000) / 100) : 0
    result[id] = { qtde, qtde_contratada: qc, pct }
  }
  return result
}
