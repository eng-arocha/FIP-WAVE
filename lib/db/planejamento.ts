import { createAdminClient } from '@/lib/supabase/admin'

export async function getPlanejamentoFisico(contratoId: string) {
  const admin = createAdminClient()
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id, codigo, nome, valor_servico')
    .eq('contrato_id', contratoId)
    .order('ordem')

  const grupoIds = (grupos || []).map((g: any) => g.id)

  const { data: plan } = await admin
    .from('planejamento_fisico')
    .select('grupo_macro_id, mes, pct_planejado')
    .in('grupo_macro_id', grupoIds)
    .order('mes')

  return { grupos: grupos || [], planejamento: plan || [] }
}

export async function getPlanejamentoFatDireto(contratoId: string) {
  const admin = createAdminClient()
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id, codigo, nome, valor_material')
    .eq('contrato_id', contratoId)
    .order('ordem')

  const grupoIds = (grupos || []).map((g: any) => g.id)

  const { data: plan } = await admin
    .from('planejamento_fat_direto')
    .select('grupo_macro_id, mes, pct_planejado')
    .in('grupo_macro_id', grupoIds)
    .order('mes')

  return { grupos: grupos || [], planejamento: plan || [] }
}

export interface CurvaSPoint {
  mes: string
  planejado_fisico: number
  planejado_fatd: number
  planejado_total: number
  realizado_fisico: number
  realizado_fatd: number
  realizado_total: number
  planejado_fisico_acum: number
  planejado_fatd_acum: number
  planejado_total_acum: number
  realizado_fisico_acum: number
  realizado_fatd_acum: number
  realizado_total_acum: number
}

export async function getCurvaS(contratoId: string): Promise<CurvaSPoint[]> {
  const admin = createAdminClient()

  // Get contract totals
  const { data: contrato } = await admin
    .from('contratos')
    .select('valor_servicos, valor_material_direto')
    .eq('id', contratoId)
    .single()

  const totalServico = contrato?.valor_servicos ?? 0
  const totalMaterial = contrato?.valor_material_direto ?? 0
  const totalGeral = totalServico + totalMaterial

  // Get all grupo values for weighting
  const { data: grupos } = await admin
    .from('grupos_macro')
    .select('id, valor_servico, valor_material')
    .eq('contrato_id', contratoId)
  const grupoMap = Object.fromEntries((grupos || []).map((g: any) => [g.id, g]))
  const grupoIds = (grupos || []).map((g: any) => g.id)

  // Get physical planning
  const { data: planFis } = await admin
    .from('planejamento_fisico')
    .select('grupo_macro_id, mes, pct_planejado')
    .in('grupo_macro_id', grupoIds)

  // Get fat direto planning
  const { data: planFatD } = await admin
    .from('planejamento_fat_direto')
    .select('grupo_macro_id, mes, pct_planejado')
    .in('grupo_macro_id', grupoIds)

  // Get all months
  const allMeses = new Set<string>()
  ;(planFis || []).forEach((p: any) => allMeses.add(p.mes))
  ;(planFatD || []).forEach((p: any) => allMeses.add(p.mes))
  const meses = Array.from(allMeses).sort()

  // Aggregate by month
  const byMes: Record<string, { planFis: number; planFatD: number }> = {}
  for (const mes of meses) {
    byMes[mes] = { planFis: 0, planFatD: 0 }
  }

  for (const p of planFis || []) {
    const g = grupoMap[p.grupo_macro_id]
    if (!g) continue
    const val = (p.pct_planejado / 100) * (g.valor_servico || 0)
    byMes[p.mes].planFis += val
  }
  for (const p of planFatD || []) {
    const g = grupoMap[p.grupo_macro_id]
    if (!g) continue
    const val = (p.pct_planejado / 100) * (g.valor_material || 0)
    byMes[p.mes].planFatD += val
  }

  // TODO: hook up real realized values from medicao_progresso_fisico and notas_fiscais_fat_direto
  // For now, realized = 0

  let accumPlanFis = 0
  let accumPlanFatD = 0

  return meses.map(mes => {
    const d = byMes[mes]
    accumPlanFis += d.planFis
    accumPlanFatD += d.planFatD
    return {
      mes,
      planejado_fisico: d.planFis,
      planejado_fatd: d.planFatD,
      planejado_total: d.planFis + d.planFatD,
      realizado_fisico: 0,
      realizado_fatd: 0,
      realizado_total: 0,
      planejado_fisico_acum: accumPlanFis,
      planejado_fatd_acum: accumPlanFatD,
      planejado_total_acum: accumPlanFis + accumPlanFatD,
      realizado_fisico_acum: 0,
      realizado_fatd_acum: 0,
      realizado_total_acum: 0,
    }
  })
}
