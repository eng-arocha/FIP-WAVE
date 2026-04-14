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

  // ── REALIZADO FÍSICO (serviço) ────────────────────────────────────
  // Fonte: medicao_itens de medições com status 'aprovado'.
  // Agregação por periodo_referencia (mês) × grupo_macro (via tarefa).
  const { data: medItens } = await admin
    .from('medicao_itens')
    .select(`
      valor_medido,
      detalhamento:detalhamentos!inner (
        tarefa:tarefas!inner ( grupo_macro_id )
      ),
      medicao:medicoes!inner ( status, periodo_referencia, contrato_id )
    `)
    .eq('medicao.contrato_id', contratoId)
    .eq('medicao.status', 'aprovado')

  // ── REALIZADO FAT-DIRETO ──────────────────────────────────────────
  // Fonte: itens de solicitações com status 'aprovado' (não deletadas).
  // Agregação por mês de data_aprovacao × grupo_macro (via tarefa do item).
  const { data: solItens } = await admin
    .from('itens_solicitacao_fat_direto')
    .select(`
      valor_total,
      tarefa:tarefas!inner ( grupo_macro_id ),
      solicitacao:solicitacoes_fat_direto!inner (
        status, data_aprovacao, contrato_id, deletado_em
      )
    `)
    .eq('solicitacao.contrato_id', contratoId)
    .eq('solicitacao.status', 'aprovado')
    .is('solicitacao.deletado_em', null)

  // Get all months
  const allMeses = new Set<string>()
  ;(planFis || []).forEach((p: any) => allMeses.add(p.mes))
  ;(planFatD || []).forEach((p: any) => allMeses.add(p.mes))
  // NOTA: Supabase-js tipa relações foreign como arrays mesmo quando
  // sabemos que retorna um único. Castamos pra `any` aqui — runtime os
  // joins com !inner garantem 1:1 e nunca undefined.
  ;(medItens || []).forEach((it: any) => {
    const m = (it.medicao as any)?.periodo_referencia
    if (m) allMeses.add(m)
  })
  ;(solItens || []).forEach((it: any) => {
    const d = (it.solicitacao as any)?.data_aprovacao
    if (d) allMeses.add(String(d).slice(0, 7)) // YYYY-MM
  })
  const meses = Array.from(allMeses).sort()

  // Aggregate by month
  const byMes: Record<string, { planFis: number; planFatD: number; realFis: number; realFatD: number }> = {}
  for (const mes of meses) {
    byMes[mes] = { planFis: 0, planFatD: 0, realFis: 0, realFatD: 0 }
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
  for (const it of (medItens || []) as any[]) {
    const mes = (it.medicao as any)?.periodo_referencia
    const grupoId = (it.detalhamento as any)?.tarefa?.grupo_macro_id
    if (!mes || !grupoId || !grupoMap[grupoId]) continue
    byMes[mes] = byMes[mes] || { planFis: 0, planFatD: 0, realFis: 0, realFatD: 0 }
    byMes[mes].realFis += Number(it.valor_medido || 0)
  }
  for (const it of (solItens || []) as any[]) {
    const d = (it.solicitacao as any)?.data_aprovacao
    const mes = d ? String(d).slice(0, 7) : null
    const grupoId = (it.tarefa as any)?.grupo_macro_id
    if (!mes || !grupoId || !grupoMap[grupoId]) continue
    byMes[mes] = byMes[mes] || { planFis: 0, planFatD: 0, realFis: 0, realFatD: 0 }
    byMes[mes].realFatD += Number(it.valor_total || 0)
  }

  let accumPlanFis = 0
  let accumPlanFatD = 0
  let accumRealFis = 0
  let accumRealFatD = 0

  return meses.map(mes => {
    const d = byMes[mes]
    accumPlanFis += d.planFis
    accumPlanFatD += d.planFatD
    accumRealFis += d.realFis
    accumRealFatD += d.realFatD
    return {
      mes,
      planejado_fisico: d.planFis,
      planejado_fatd: d.planFatD,
      planejado_total: d.planFis + d.planFatD,
      realizado_fisico: d.realFis,
      realizado_fatd: d.realFatD,
      realizado_total: d.realFis + d.realFatD,
      planejado_fisico_acum: accumPlanFis,
      planejado_fatd_acum: accumPlanFatD,
      planejado_total_acum: accumPlanFis + accumPlanFatD,
      realizado_fisico_acum: accumRealFis,
      realizado_fatd_acum: accumRealFatD,
      realizado_total_acum: accumRealFis + accumRealFatD,
    }
  })
}
