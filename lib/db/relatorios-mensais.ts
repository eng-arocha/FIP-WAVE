import { createAdminClient } from '@/lib/supabase/admin'
import { detectarPedidosAtrasados } from '@/lib/db/fat-direto'
import { log } from '@/lib/log'

const DIAS_THRESHOLD_RELATORIO = 30

/**
 * Verifica se já existe relatório mensal pra (contrato, ano, mes) atual e,
 * se não existir, gera. Idempotente: chamado várias vezes, cria 1 só.
 *
 * Trigger: chamado por `/api/cron/relatorio-mensal-tick` que roda no
 * primeiro acesso do mês (sem cron externo). Calcula sequencia_cobranca
 * comparando IDs de pedidos com relatórios anteriores do mesmo contrato.
 */
export async function gerarOuObterRelatorioMensal(input: {
  contrato_id: string
  ano: number
  mes: number
}): Promise<{ id: string; criado: boolean; pedidos: number }> {
  const admin = createAdminClient()

  // 1) Já existe? (resiliente: se tabela não existe ainda, no-op)
  const { data: existente, error: selErr } = await admin
    .from('relatorios_mensais_fat_direto')
    .select('id, qtd_pedidos')
    .eq('contrato_id', input.contrato_id)
    .eq('ano', input.ano)
    .eq('mes', input.mes)
    .maybeSingle()
  if (selErr && /relation .* does not exist|undefined_table/i.test(selErr.message)) {
    log.warn('relatorio_mensal_tabela_pendente', { contrato_id: input.contrato_id })
    return { id: '', criado: false, pedidos: 0 }
  }
  if (existente) {
    return { id: (existente as any).id, criado: false, pedidos: (existente as any).qtd_pedidos }
  }

  // 2) Gera lista de pedidos atrasados (threshold 30 dias)
  const result = await detectarPedidosAtrasados({
    contrato_id: input.contrato_id,
    dias_threshold: DIAS_THRESHOLD_RELATORIO,
  })

  // Sem pedidos atrasados — não cria registro (evita poluição da tabela)
  if (result.pedidos.length === 0) {
    return { id: '', criado: false, pedidos: 0 }
  }

  // 3) Calcula sequencia_cobranca: pega relatórios anteriores do mesmo
  //    contrato e conta quantos têm interseção de IDs.
  const idsAtuais = new Set(result.pedidos.map(p => p.id))
  const { data: anteriores } = await admin
    .from('relatorios_mensais_fat_direto')
    .select('pedidos_snapshot')
    .eq('contrato_id', input.contrato_id)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(12)

  let sequencia = 1
  for (const r of (anteriores || []) as any[]) {
    const arr = r.pedidos_snapshot as Array<{ id: string }>
    if (Array.isArray(arr) && arr.some(p => idsAtuais.has(p.id))) {
      sequencia += 1
    }
  }

  const valorTotal = result.pedidos.reduce((s, p) => s + p.saldo, 0)

  // 4) Insere
  const { data: novo, error } = await admin
    .from('relatorios_mensais_fat_direto')
    .insert({
      contrato_id: input.contrato_id,
      ano: input.ano,
      mes: input.mes,
      pedidos_snapshot: result.pedidos,
      qtd_pedidos: result.pedidos.length,
      valor_total_atrasado: valorTotal,
      sequencia_cobranca: sequencia,
      status: 'pendente',
    })
    .select('id')
    .single()
  if (error) throw error

  log.info('relatorio_mensal_gerado', {
    contrato_id: input.contrato_id,
    ano: input.ano,
    mes: input.mes,
    qtd: result.pedidos.length,
    sequencia,
  })

  return { id: (novo as any).id, criado: true, pedidos: result.pedidos.length }
}

/**
 * Para todos os contratos ativos, garante que existe relatório do mês corrente.
 * Devolve lista de relatórios criados/existentes pra UI exibir banner.
 */
export async function tickRelatorioMensal(): Promise<{
  contratos_processados: number
  relatorios_criados: number
}> {
  const admin = createAdminClient()
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = agora.getMonth() + 1

  const { data: contratos } = await admin
    .from('contratos')
    .select('id, status')
    .eq('status', 'ativo')

  let processados = 0
  let criados = 0
  for (const c of (contratos || []) as any[]) {
    processados += 1
    try {
      const r = await gerarOuObterRelatorioMensal({ contrato_id: c.id, ano, mes })
      if (r.criado) criados += 1
    } catch (e: any) {
      log.error('relatorio_mensal_tick_erro', { contrato_id: c.id, error: e?.message })
    }
  }
  return { contratos_processados: processados, relatorios_criados: criados }
}
