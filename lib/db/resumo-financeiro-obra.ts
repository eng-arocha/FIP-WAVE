import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError, withSchemaFallback } from '@/lib/db/resilient'
import { ehPedidoDeServicoWave, type SolicitacaoClassificavel } from '@/lib/db/saldo-detalhamento'

/**
 * Resumo financeiro consolidado da obra (contrato), no contexto de uma
 * medição. Usado pra:
 *   - Email de liberação de medição (bloco "Resumo Financeiro da Obra")
 *   - Card "Retenção Contratual" no dashboard / página do contrato
 *   - Card de retenção na detail page da medição
 *
 * Calculado on-the-fly (não persistido) para sempre refletir o estado atual
 * dos dados. Snapshots de retenção, sim, ficam congelados na medição
 * (andamento_fisico_pct, valor_financeiro_proporcional, valor_retencao_garantia).
 */

export interface ResumoFinanceiroObra {
  contrato: {
    id: string
    numero: string | null
    valor_total: number
    valor_servicos: number
    valor_material_direto: number
    percentual_retencao: number
  }
  servicos: {
    /** valor_total da medição atual */
    esta_medicao: number
    /** soma de todas as medições aprovadas (inclui esta — pós-aprovação) */
    acumulado: number
    /** acumulado / valor_servicos × 100 */
    pct_limite: number
    /** acumulado / valor_total_contrato × 100 (= andamento físico geral) */
    pct_contrato: number
    /** valor_servicos − acumulado */
    saldo: number
  }
  material: {
    /** soma de NFs lançadas (não-rejeitadas) acumulado desde início */
    nfs_recebidas_acumulado: number
    /** subset acumulado: NFs lançadas no período (entre última medição aprovada e esta) */
    nfs_recebidas_periodo: number
    /** soma de solicitações em status aprovado/encerrado (compromisso firmado) */
    aprovado_acumulado: number
    /** subset acumulado: solicitações aprovadas no período */
    aprovado_periodo: number
    pct_recebidas_limite: number
    pct_aprovado_limite: number
    saldo_aprovado: number
    saldo_recebido: number
  }
  periodo: {
    inicio: string | null   // data_aprovacao da medição APROVADA anterior (ISO) ou null
    fim: string             // data_aprovacao desta (ou data_submissao se ainda não aprovada)
    eh_primeira_medicao: boolean
  }
  retencao: {
    valor: number                          // base × percentual_retencao
    percentual_aplicado: number            // contrato.percentual_retencao
    /** Material correspondente desta medição (qtde × valor_material_unit). */
    material_correspondente: number
    /** Serviço medido desta medição (= medicao.valor_total). */
    servico_medido: number
    /** Base da retenção = material_correspondente + servico_medido. */
    base_retencao: number
    /** Andamento físico = (mat + serv executados nesta medição) / valor_total_contrato × 100. */
    andamento_fisico_pct: number
    /**
     * Valor da NF de serviço a emitir = serviço medido − retenção − ajuste de
     * rateio. Quem preenche a partir do boletim deve usar
     * `InformaconTotais.servico_liquido`, não refazer a subtração.
     */
    liquido_a_pagar: number
    /**
     * Divergência de rateio material/serviço entre o orçamento do sistema e o
     * do ERP da FIP, sobre o mesmo total medido (migration 074). Já abatida em
     * `liquido_a_pagar`. Não é retenção: não volta a ser paga depois.
     */
    ajuste_material_anterior?: number
    ajuste_material_anterior_motivo?: string | null
  }
}

interface CalcArgs {
  contrato_id: string
  medicao_id: string
}

export async function calcularResumoFinanceiroObra(args: CalcArgs): Promise<ResumoFinanceiroObra> {
  const admin = createAdminClient()

  // 1) Carrega contrato (resiliente a percentual_retencao ausente — migration 051)
  const contratoRes = await withSchemaFallback({
    primary: () => admin.from('contratos')
      .select('id, numero, valor_total, valor_servicos, valor_material_direto, percentual_retencao')
      .eq('id', args.contrato_id)
      .single(),
    fallback: () => admin.from('contratos')
      .select('id, numero, valor_total, valor_servicos, valor_material_direto')
      .eq('id', args.contrato_id)
      .single(),
    missingColumns: ['percentual_retencao'],
    context: 'calcularResumoFinanceiroObra:contrato',
  })
  if (contratoRes.error) throw contratoRes.error
  const contrato = contratoRes.data

  // 2) Carrega medição (resiliente a snapshots de retenção ausentes)
  const medicaoRes = await withSchemaFallback({
    primary: () => admin.from('medicoes')
      .select('id, contrato_id, valor_total, status, data_aprovacao, data_submissao, andamento_fisico_pct, valor_material_correspondente, valor_retencao_garantia')
      .eq('id', args.medicao_id)
      .single(),
    fallback: () => admin.from('medicoes')
      .select('id, contrato_id, valor_total, status, data_aprovacao, data_submissao')
      .eq('id', args.medicao_id)
      .single(),
    missingColumns: ['andamento_fisico_pct', 'valor_material_correspondente', 'valor_retencao_garantia'],
    context: 'calcularResumoFinanceiroObra:medicao',
  })
  if (medicaoRes.error) throw medicaoRes.error
  const medicao = medicaoRes.data

  if (!contrato) throw new Error(`Contrato ${args.contrato_id} não encontrado`)
  if (!medicao)  throw new Error(`Medição ${args.medicao_id} não encontrada`)

  const valor_total_contrato = Number((contrato as any).valor_total || 0)
  const valor_servicos = Number((contrato as any).valor_servicos || 0)
  const valor_material_direto = Number((contrato as any).valor_material_direto || 0)
  const percentual_retencao = Number((contrato as any).percentual_retencao ?? 5)

  const valor_medicao_atual = Number((medicao as any).valor_total || 0)

  // 2) Última medição APROVADA anterior (define o início do "período")
  const dataMedicaoAtual = (medicao as any).data_aprovacao || (medicao as any).data_submissao
  const { data: ultimaAnterior } = await admin
    .from('medicoes')
    .select('id, data_aprovacao')
    .eq('contrato_id', args.contrato_id)
    .eq('status', 'aprovado')
    .neq('id', args.medicao_id)
    .lt('data_aprovacao', dataMedicaoAtual ?? new Date().toISOString())
    .order('data_aprovacao', { ascending: false })
    .limit(1)

  const inicioPeriodo: string | null = ultimaAnterior?.[0]?.data_aprovacao ?? null
  const ehPrimeira = !inicioPeriodo

  // 3) Acumulados de SERVIÇOS (medições aprovadas, inclui esta se já aprovada)
  const { data: medicoesAprovadas } = await admin
    .from('medicoes')
    .select('id, valor_total, status')
    .eq('contrato_id', args.contrato_id)
    .eq('status', 'aprovado')

  const acumuladoServicosAprovadas = (medicoesAprovadas || [])
    .reduce((s: number, m: any) => s + Number(m.valor_total || 0), 0)
  // Se esta medição ainda não está em status aprovado, soma manualmente pra refletir post-aprovação.
  const estaJaSomada = (medicoesAprovadas || []).some((m: any) => m.id === args.medicao_id)
  const acumuladoServicos = estaJaSomada
    ? acumuladoServicosAprovadas
    : acumuladoServicosAprovadas + valor_medicao_atual

  // 4) Material — NFs recebidas (acumulado + período)
  // Em vez de join inline (frágil em PostgREST), 2 queries: pega ids de
  // solicitações do contrato, depois NFs com solicitacao_id IN (...).
  // Só pedidos de MATERIAL ativos: a NF de serviço da Wave não entra no
  // desconto de material (é o defeito que a migration 074 documenta), e
  // pedidos soft-deleted não deviam contar.
  const { data: solsDoContrato } = await admin
    .from('solicitacoes_fat_direto')
    .select('id, tipo, fornecedor_cnpj, fornecedor_razao_social')
    .eq('contrato_id', args.contrato_id)
    .is('deletado_em', null)
  const solIds = (solsDoContrato || [])
    .filter((s: SolicitacaoClassificavel) => !ehPedidoDeServicoWave(s))
    .map((s: { id: string }) => s.id)

  let nfsDoContrato: Array<{ valor: number; created_at: string | null }> = []
  if (solIds.length > 0) {
    const { data: nfsAtivas } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id, valor, status, created_at')
      .in('solicitacao_id', solIds)
      .neq('status', 'cancelada')
    nfsDoContrato = (nfsAtivas || []).map((n: any) => ({
      valor: Number(n.valor || 0),
      created_at: n.created_at ?? null,
    }))
  }
  const nfsRecebidasAcumulado = nfsDoContrato.reduce((s, n) => s + n.valor, 0)
  const nfsRecebidasPeriodo = inicioPeriodo
    ? nfsDoContrato
        .filter(n => n.created_at && n.created_at > inicioPeriodo)
        .reduce((s, n) => s + n.valor, 0)
    : nfsRecebidasAcumulado // primeira medição: tudo é "do período"

  // 5) Material — solicitações aprovadas (compromisso firmado).
  // Inclui status='encerrado' (com valor_total já ajustado pela devolução).
  let solsAprovadas: any[] = []
  try {
    const res = await admin
      .from('solicitacoes_fat_direto')
      .select('id, valor_total, status, data_aprovacao, tipo, fornecedor_cnpj, fornecedor_razao_social')
      .eq('contrato_id', args.contrato_id)
      .is('deletado_em', null)
      .in('status', ['aprovado', 'encerrado'])
    solsAprovadas = res.data || []
  } catch (e: any) {
    // 'encerrado' pode não ser válido no constraint enquanto migration 050 não roda — fallback
    if (isSchemaMissingError(e, ['encerrado'])) {
      const res = await admin
        .from('solicitacoes_fat_direto')
        .select('id, valor_total, status, data_aprovacao, tipo, fornecedor_cnpj, fornecedor_razao_social')
        .eq('contrato_id', args.contrato_id)
        .is('deletado_em', null)
        .eq('status', 'aprovado')
      solsAprovadas = res.data || []
    } else {
      throw e
    }
  }

  // Fora os pedidos de serviço da Wave — não consomem o teto de material.
  solsAprovadas = solsAprovadas.filter((s: SolicitacaoClassificavel) => !ehPedidoDeServicoWave(s))

  const aprovadoAcumulado = solsAprovadas.reduce((s: number, x: any) => s + Number(x.valor_total || 0), 0)
  const aprovadoPeriodo = inicioPeriodo
    ? solsAprovadas
        .filter((x: any) => x.data_aprovacao && x.data_aprovacao > inicioPeriodo)
        .reduce((s: number, x: any) => s + Number(x.valor_total || 0), 0)
    : aprovadoAcumulado

  // 6) Retenção — calcula MATERIAL e SERVIÇO separadamente a partir dos itens
  // (qtde × valor_material_unit ou valor_servico_unit). Em medição aprovada,
  // prefere snapshot persistido. valor_total da medição = mat + serv.
  let materialCorrespondente = 0
  let servicoMedido = 0

  const snapshotMat = Number((medicao as any).valor_material_correspondente || 0)
  if (snapshotMat > 0 && (medicao as any).status === 'aprovado') {
    materialCorrespondente = snapshotMat
    servicoMedido = Math.max(0, valor_medicao_atual - snapshotMat)
  } else {
    const { data: itensRaw } = await admin
      .from('medicao_itens')
      .select(`
        quantidade_medida,
        detalhamento:detalhamentos ( valor_material_unit, valor_servico_unit )
      `)
      .eq('medicao_id', args.medicao_id)
    for (const it of (itensRaw || []) as any[]) {
      const qtd = Number(it.quantidade_medida || 0)
      materialCorrespondente += qtd * Number(it.detalhamento?.valor_material_unit || 0)
      servicoMedido          += qtd * Number(it.detalhamento?.valor_servico_unit  || 0)
    }
    // Sanity: se mat+serv unit ausentes, usa valor_total como serviço (legado)
    if (materialCorrespondente === 0 && servicoMedido === 0 && valor_medicao_atual > 0) {
      servicoMedido = valor_medicao_atual
    }
  }

  const baseRetencao = materialCorrespondente + servicoMedido
  const valor_retencao = baseRetencao * (percentual_retencao / 100)
  const andamento_fisico_pct = valor_total_contrato > 0
    ? (baseRetencao / valor_total_contrato) * 100
    : 0
  const liquido_a_pagar = servicoMedido - valor_retencao

  return {
    contrato: {
      id: (contrato as any).id,
      numero: (contrato as any).numero ?? null,
      valor_total: valor_total_contrato,
      valor_servicos,
      valor_material_direto,
      percentual_retencao,
    },
    servicos: {
      esta_medicao: valor_medicao_atual,
      acumulado: acumuladoServicos,
      pct_limite: valor_servicos > 0 ? (acumuladoServicos / valor_servicos) * 100 : 0,
      pct_contrato: valor_total_contrato > 0 ? (acumuladoServicos / valor_total_contrato) * 100 : 0,
      saldo: Math.max(0, valor_servicos - acumuladoServicos),
    },
    material: {
      nfs_recebidas_acumulado: nfsRecebidasAcumulado,
      nfs_recebidas_periodo: nfsRecebidasPeriodo,
      aprovado_acumulado: aprovadoAcumulado,
      aprovado_periodo: aprovadoPeriodo,
      pct_recebidas_limite: valor_material_direto > 0 ? (nfsRecebidasAcumulado / valor_material_direto) * 100 : 0,
      pct_aprovado_limite:  valor_material_direto > 0 ? (aprovadoAcumulado / valor_material_direto) * 100 : 0,
      saldo_aprovado: Math.max(0, valor_material_direto - aprovadoAcumulado),
      saldo_recebido: Math.max(0, valor_material_direto - nfsRecebidasAcumulado),
    },
    periodo: {
      inicio: inicioPeriodo,
      fim: dataMedicaoAtual ?? new Date().toISOString(),
      eh_primeira_medicao: ehPrimeira,
    },
    retencao: {
      valor: valor_retencao,
      percentual_aplicado: percentual_retencao,
      material_correspondente: materialCorrespondente,
      servico_medido: servicoMedido,  // só serviço (NF a emitir)
      base_retencao: baseRetencao,
      andamento_fisico_pct,
      liquido_a_pagar,
    },
  }
}

/**
 * Soma simples de retenções aprovadas no contrato — usado em cards
 * (dashboard / página do contrato).
 */
export async function totalRetencaoAcumuladaContrato(contratoId: string): Promise<{ total: number; qtd: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('medicoes')
    .select('valor_retencao_garantia')
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
  if (error) throw error
  const total = (data || []).reduce((s: number, m: any) => s + Number(m.valor_retencao_garantia || 0), 0)
  return { total, qtd: (data || []).length }
}

/**
 * Total global (todos contratos) de retenção acumulada — pro card do dashboard geral.
 */
export async function totalRetencaoGlobal(): Promise<{ total: number; qtd: number }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('medicoes')
    .select('valor_retencao_garantia')
    .eq('status', 'aprovado')
  if (error) throw error
  const total = (data || []).reduce((s: number, m: any) => s + Number(m.valor_retencao_garantia || 0), 0)
  return { total, qtd: (data || []).length }
}
