import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/cronograma/matriz
 *
 * Retorna a matriz completa do cronograma físico + fat direto do contrato.
 *   {
 *     grupos: [{ id, codigo, nome, valor_servico, valor_material }],
 *     meses:  ['2026-03-01', '2026-04-01', ...],  // ordenados
 *     fisico:    { [grupo_id]: { [mes]: pct } },
 *     fatdireto: { [grupo_id]: { [mes]: pct } },
 *   }
 *
 * Se o contrato tem data_inicio / data_fim, gera meses do período mesmo que
 * não haja planejamento registrado — assim a UI exibe as colunas todas com 0
 * e o usuário pode preencher.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const [{ data: contrato }, { data: grupos }] = await Promise.all([
      admin.from('contratos').select('data_inicio, data_fim, valor_servicos, valor_material_direto').eq('id', id).single(),
      admin.from('grupos_macro').select('id, codigo, nome, valor_servico, valor_material').eq('contrato_id', id).order('ordem'),
    ])

    const grupoIds = (grupos || []).map((g: any) => g.id)
    const [{ data: planFis }, { data: planFatd }] = await Promise.all([
      admin.from('planejamento_fisico').select('grupo_macro_id, mes, pct_planejado').in('grupo_macro_id', grupoIds),
      admin.from('planejamento_fat_direto').select('grupo_macro_id, mes, pct_planejado').in('grupo_macro_id', grupoIds),
    ])

    // Reúne todos os meses: dos planejamentos + intervalo do contrato
    const mesesSet = new Set<string>()
    ;(planFis || []).forEach((p: any) => mesesSet.add(String(p.mes).slice(0, 10)))
    ;(planFatd || []).forEach((p: any) => mesesSet.add(String(p.mes).slice(0, 10)))
    if (contrato?.data_inicio && contrato?.data_fim) {
      const start = new Date(contrato.data_inicio)
      const end = new Date(contrato.data_fim)
      const cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        const y = cur.getFullYear()
        const m = String(cur.getMonth() + 1).padStart(2, '0')
        mesesSet.add(`${y}-${m}-01`)
        cur.setMonth(cur.getMonth() + 1)
      }
    }
    const meses = Array.from(mesesSet).sort()

    const fisico: Record<string, Record<string, number>> = {}
    const fatdireto: Record<string, Record<string, number>> = {}
    for (const p of planFis || []) {
      const gId = p.grupo_macro_id, mes = String(p.mes).slice(0, 10)
      if (!fisico[gId]) fisico[gId] = {}
      fisico[gId][mes] = Number(p.pct_planejado || 0)
    }
    for (const p of planFatd || []) {
      const gId = p.grupo_macro_id, mes = String(p.mes).slice(0, 10)
      if (!fatdireto[gId]) fatdireto[gId] = {}
      fatdireto[gId][mes] = Number(p.pct_planejado || 0)
    }

    return NextResponse.json({
      grupos: grupos || [],
      meses,
      fisico,
      fatdireto,
      contrato: {
        valor_servicos: contrato?.valor_servicos ?? 0,
        valor_material_direto: contrato?.valor_material_direto ?? 0,
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
