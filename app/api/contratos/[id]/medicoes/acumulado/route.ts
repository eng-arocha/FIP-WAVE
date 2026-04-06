import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Returns { [detalhamento_id]: pct_acumulado } from all APPROVED medições for this contract
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // Get approved medicao_itens for this contract
    const { data, error } = await admin
      .from('medicao_itens')
      .select('detalhamento_id, quantidade_medida, detalhamento:detalhamentos(quantidade_contratada)')
      .eq('medicoes.contrato_id', id)
      .eq('medicoes.status', 'aprovado')
      .not('detalhamento_id', 'is', null)

    if (error) {
      // fallback: join manually
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
    }

    return NextResponse.json(buildMap(data || []))
  } catch (e: any) {
    return NextResponse.json({}, { status: 200 }) // fail silently — no blocker
  }
}

function buildMap(itens: any[]): Record<string, number> {
  const sumQtd: Record<string, number> = {}
  const contratada: Record<string, number> = {}

  for (const it of itens) {
    if (!it.detalhamento_id) continue
    sumQtd[it.detalhamento_id] = (sumQtd[it.detalhamento_id] || 0) + (it.quantidade_medida || 0)
    const qc = it.detalhamento?.quantidade_contratada
    if (qc) contratada[it.detalhamento_id] = qc
  }

  const result: Record<string, number> = {}
  for (const id of Object.keys(sumQtd)) {
    const qc = contratada[id] || 1
    // Round to nearest 25
    const raw = (sumQtd[id] / qc) * 100
    result[id] = Math.min(100, Math.round(raw / 25) * 25)
  }
  return result
}
