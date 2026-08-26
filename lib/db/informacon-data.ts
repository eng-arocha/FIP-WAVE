// Função compartilhada que monta o "boletim Informakon" (linhas + totais)
// pra uma medição. Extraída da rota /api/.../informacon pra eliminar a
// dependência de self-fetch HTTP em outros consumidores (rota aprovar e
// email-preview) — self-fetch falha em prod no Vercel por questões de
// cookies/host/cold-start (mesmo padrão do fix de /origem em f6d3176).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import {
  calcularDescontoComTransbordo,
  calcularSaldoAprovadoComTransbordo,
  type NivelApuracao,
  type ItemDesconto,
  type ItemSaldoAprovado,
} from '@/lib/db/desconto-transbordo'
import { getCodigoInformakon } from '@/lib/data/informakon-codigos'

// A classificação "pedido é NF de serviço da Wave" mora em
// `lib/db/saldo-detalhamento.ts` (módulo sem dependências), porque além do
// desconto de material ela decide contra qual base contratual — material ou
// mão de obra — o pedido consome saldo. Re-exportado aqui pra não quebrar os
// importadores existentes.
export { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'
import { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'

/**
 * Quanto de NF de material já foi abatido em cada detalhamento nas medições
 * APROVADAS do contrato, excluindo a medição corrente. É o saldo corrido que
 * garante que cada nota seja descontada uma única vez (migration 074).
 *
 * Resiliente: se `nf_material_descontada` não existe ainda, devolve mapa
 * vazio — o cálculo volta ao comportamento anterior (NF acumulada inteira
 * disponível), sem quebrar a página.
 */
async function carregarNfJaAbatida(
  admin: SupabaseClient,
  medicaoIdsAnteriores: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (medicaoIdsAnteriores.length === 0) return out
  const { data, error } = await admin
    .from('medicao_itens')
    .select('detalhamento_id, nf_material_descontada')
    .in('medicao_id', medicaoIdsAnteriores)
  if (error) {
    if (!isSchemaMissingError(error, ['nf_material_descontada'])) {
      console.warn('[informacon] falha ao carregar nf_material_descontada:', error.message)
    }
    return out
  }
  for (const r of (data || []) as any[]) {
    if (!r.detalhamento_id) continue
    out[r.detalhamento_id] = (out[r.detalhamento_id] || 0) + Number(r.nf_material_descontada || 0)
  }
  return out
}

export interface AjusteAdmin {
  quantidade_anterior: number
  quantidade_nova: number
  motivo: string
  ajustado_em: string
  ajustado_por_nome: string | null
}

export interface InformaconLinha {
  /**
   * ID da row em `medicao_itens`. `null` quando a linha é "virtual" — o
   * detalhamento existe no contrato mas ainda não foi medido (qty=0).
   * Nesse caso, ao ajustar, o backend cria o row.
   */
  medicao_item_id: string | null
  /**
   * Tarefa dona do detalhamento. É o BALDE em que o desconto de NF é apurado
   * (ver lib/db/desconto-transbordo.ts): sem ele a UI não consegue mostrar
   * quais notas alimentam o `nf_descontavel` desta linha.
   */
  tarefa_id?: string | null
  /** True quando há row em medicao_itens; false quando é detalhamento puro. */
  existe_no_banco: boolean
  detalhamento_id: string
  codigo: string
  codigo_informakon: string | null
  descricao: string
  unidade: string
  quantidade_contratada: number
  quantidade_medida: number
  quantidade_acumulada: number
  pct_medido: number
  pct_acumulado: number
  valor_unitario: number
  valor_material_unit: number
  valor_servico_unit: number
  valor_total_item: number
  valor_material_total_item: number
  valor_servico_total_item: number
  material_medido: number
  servico_medido: number
  nf_terceiro: number
  /** NF de material deste item já abatida em medições aprovadas anteriores. */
  nf_ja_abatida: number
  /** NF de material ainda disponível pra abater = nf_terceiro − nf_ja_abatida. */
  nf_disponivel: number
  saldo_aprovado: number
  nf_descontavel: number
  /** Parte do desconto que veio de NF ociosa de outro detalhamento do grupo. */
  nf_transbordo_grupo: number
  /**
   * Parte do desconto que excede o material medido NO PERÍODO — nota de
   * medições anteriores recuperada pela régua acumulada. Já está dentro de
   * `nf_descontavel`; não somar de novo.
   */
  nf_recuperacao_anterior: number
  gap_material: number
  faturamento_direto_em_aberto: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  pct_informakon: number
  /**
   * Valor que o Informakon deve LIBERAR para este item = serviço medido +
   * material que já virou nota. Difere de `dados_informakon` (o espelho do
   * executado) exatamente pelo Gap. Ver o cálculo em `calcularInformaconData`.
   */
  informakon_a_lancar?: number
  /** `informakon_a_lancar` ÷ valor global × 100 — o número que se digita. */
  pct_informakon_a_lancar?: number
  /**
   * `dados_informakon − informakon_a_lancar`. Positivo = Gap segurado
   * (Retido + FIP Fat-Dir). Negativo = nota antiga sendo recuperada.
   */
  correcao_informakon?: number
  alterado_por_retido: boolean
  base_retencao: number
  retencao: number
  pct_serv_med_original: number
  pct_serv_med: number
  ajuste_aplicado: boolean
  confirmacao_sem_nf: boolean
  confirmacao_sem_nf_em: string | null
  confirmacao_sem_nf_motivo: string | null
  material_acumulado: number
  servico_acumulado: number
  ajustes_admin: AjusteAdmin[]
  foi_ajustado_pelo_admin: boolean
}

export interface InformaconTotais {
  material_medido: number
  servico_medido: number
  nf_terceiro: number
  saldo_aprovado: number
  nf_descontavel: number
  /** Parte do desconto que veio de NF ociosa de outro detalhamento do grupo. */
  nf_transbordo_grupo: number
  /** Desconto que excede o material do período — recuperação de meses anteriores. */
  nf_recuperacao_anterior: number
  gap_material: number
  faturamento_direto_em_aberto: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  /** Soma de `informakon_a_lancar` das linhas — o total a liberar. */
  informakon_a_lancar: number
  /** Soma de `correcao_informakon` — o Gap total segurado nesta medição. */
  correcao_informakon: number
  base_retencao: number
  retencao: number
  material_acumulado: number
  servico_acumulado: number
  itens_com_ajuste: number
  /**
   * Divergência de rateio material/serviço entre o orçamento do sistema e o do
   * ERP da FIP, sobre o mesmo total medido (migration 074). Não é retenção:
   * não volta a ser paga depois.
   */
  ajuste_material_anterior: number
  ajuste_material_anterior_motivo: string | null
  /**
   * Valor da NF de serviço a emitir = wave_servico − retenção − ajuste.
   * Fonte única: quem for exibir "NF a emitir" deve usar este campo em vez de
   * refazer a conta, porque o ajuste é fácil de esquecer.
   */
  servico_liquido: number
}

export interface InformaconData {
  medicao: {
    id: string
    numero: number
    periodo_referencia: string
    status: string
    data_aprovacao: string | null
    data_submissao: string | null
    contrato: {
      id: string
      numero: string
      valor_total: number
      percentual_retencao: number
    }
  }
  linhas: InformaconLinha[]
  totais: InformaconTotais
}

// ============================================================
// DRY-RUN / SIMULAÇÃO — calcula o boletim REAL a partir de itens em
// memória (form de nova medição), SEM gravar nada. Reaproveita os mapas
// de NFs/pedidos reais do contrato pra que o fornecedor veja exatamente
// como ficará na aprovação: material medido, material já com NF lançada,
// direito de NF material FIP e saldo de serviço líquido.
// ============================================================
export interface BoletimSimuladoLinha {
  detalhamento_id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_medida: number
  material_medido: number
  servico_medido: number
  nf_material_lancada: number      // nf_descontavel
  fat_direto_em_aberto: number     // saldo de pedidos aprovados
  fip_a_emitir: number             // fip_faturar (direito a NF material FIP)
  base_retencao: number
  retencao: number
  servico_liquido: number          // serviço − retenção (NF de serviço a emitir)
}

export interface BoletimSimulado {
  linhas: BoletimSimuladoLinha[]
  totais: {
    material_medido: number
    servico_medido: number
    nf_material_lancada: number
    fat_direto_em_aberto: number
    fip_a_emitir: number
    base_retencao: number
    retencao: number
    servico_liquido: number
    total_medido: number
  }
  pct_retencao: number
}

export async function calcularBoletimSimulado(
  admin: SupabaseClient,
  contratoId: string,
  itens: { detalhamento_id: string; quantidade_medida: number }[],
): Promise<BoletimSimulado> {
  const vazio: BoletimSimulado = {
    linhas: [],
    totais: {
      material_medido: 0, servico_medido: 0, nf_material_lancada: 0,
      fat_direto_em_aberto: 0, fip_a_emitir: 0, base_retencao: 0,
      retencao: 0, servico_liquido: 0, total_medido: 0,
    },
    pct_retencao: 5,
  }
  const itensValidos = (itens || []).filter(i => i.detalhamento_id && Number(i.quantidade_medida) > 0)
  if (itensValidos.length === 0) return vazio

  // Contrato (fallback p/ percentual_retencao ausente no schema cache)
  let pctRetencao = 5
  {
    const tryFull = await admin
      .from('contratos').select('percentual_retencao').eq('id', contratoId).single()
    if (!tryFull.error && tryFull.data) {
      pctRetencao = Number((tryFull.data as any).percentual_retencao ?? 5)
    }
  }

  // Detalhamentos dos itens (units) — fallback se mat/serv unit não existem
  const detIds = itensValidos.map(i => i.detalhamento_id)
  const detMap = new Map<string, any>()
  {
    const tryFull = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, valor_material_unit, valor_servico_unit')
      .in('id', detIds)
    if (!tryFull.error && tryFull.data) {
      for (const d of tryFull.data as any[]) detMap.set(d.id, d)
    } else if (tryFull.error && isSchemaMissingError(tryFull.error, ['valor_material_unit', 'valor_servico_unit'])) {
      const fb = await admin
        .from('detalhamentos')
        .select('id, codigo, descricao, unidade, quantidade_contratada, valor_unitario')
        .in('id', detIds)
      if (!fb.error && fb.data) for (const d of fb.data as any[]) detMap.set(d.id, d)
    }
  }

  // Solicitações fat-direto APROVADAS + NFs alocadas por detalhamento
  // (mesma lógica de calcularInformaconData)
  const aprovadoPorDet: Record<string, number> = {}
  const nfAlocadaPorDet: Record<string, number> = {}
  {
    const { data: solRaw } = await admin
      .from('solicitacoes_fat_direto')
      .select(`id, status, deletado_em, fornecedor_cnpj, fornecedor_razao_social,
        itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
        nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null)
    for (const sol of (solRaw || []) as any[]) {
      // NF de SERVIÇO da Wave não abate material (ver calcularInformaconData).
      // Aqui a coluna `tipo` não é selecionada de propósito: a simulação roda
      // no caminho crítico da tela de nova medição e o CNPJ já resolve.
      if (ehPedidoDeServicoWave(sol)) continue
      const itensVal = ((sol.itens || []) as any[])
        .map(it => ({ detId: it.detalhamento_id as string | null, valor: Number(it.valor_total || 0) }))
        .filter(x => x.detId)
      const totalSol = itensVal.reduce((s, it) => s + it.valor, 0)
      for (const it of itensVal) aprovadoPorDet[it.detId!] = (aprovadoPorDet[it.detId!] || 0) + it.valor
      const totalNfsSol = ((sol.nfs || []) as any[]).reduce((s: number, nf: any) => s + Number(nf.valor || 0), 0)
      if (totalSol > 0 && totalNfsSol > 0) {
        for (const it of itensVal) {
          const share = it.valor / totalSol
          nfAlocadaPorDet[it.detId!] = (nfAlocadaPorDet[it.detId!] || 0) + totalNfsSol * share
        }
      }
    }
  }

  // Saldo corrido: numa medição nova, todas as aprovadas são "anteriores".
  const nfJaAbatidaPorDet = await (async () => {
    const { data: aprovadas } = await admin
      .from('medicoes')
      .select('id')
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
    return carregarNfJaAbatida(admin, (aprovadas || []).map((m: any) => m.id))
  })()

  // Material já medido nas aprovadas — o teto da régua acumulada. Sem isto a
  // simulação apuraria só o período e prometeria um desconto menor do que a
  // medição real entregaria.
  const matAcumAprovadoPorDet: Record<string, number> = {}
  {
    const { data: aprovadas } = await admin
      .from('medicoes')
      .select('id')
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
    const ids = (aprovadas || []).map((m: any) => m.id)
    if (ids.length > 0) {
      const { data: rows } = await admin
        .from('medicao_itens')
        .select('detalhamento_id, valor_material_correspondente, quantidade_medida')
        .in('medicao_id', ids)
      for (const r of (rows || []) as any[]) {
        if (!r.detalhamento_id) continue
        const det = detMap.get(r.detalhamento_id)
        // `> 0`, não `!= null`: nas medições aprovadas antes da migration 074
        // esta coluna por item ficou gravada como 0, não null — o teste de
        // nulidade passava e zerava o teto acumulado da régua de desconto.
        // Mesma armadilha que zerou a MED-003 na tela.
        const snapshotItem = Number(r.valor_material_correspondente ?? 0)
        const valor = snapshotItem > 0
          ? snapshotItem
          : Number(r.quantidade_medida || 0) * Number(det?.valor_material_unit || 0)
        matAcumAprovadoPorDet[r.detalhamento_id] =
          (matAcumAprovadoPorDet[r.detalhamento_id] || 0) + valor
      }
    }
  }

  const detIdsRelevantes = Array.from(new Set([
    ...itensValidos.map(i => i.detalhamento_id),
    ...Object.keys(nfAlocadaPorDet),
    ...Object.keys(aprovadoPorDet),
    ...Object.keys(matAcumAprovadoPorDet),
  ]))
  const grupoPorDet: Record<string, string> = {}
  /** Balde alternativo — usado só nos grupos fixados em 'tarefa'. */
  const tarefaPorDet: Record<string, string> = {}
  /**
   * Nível de apuração por grupo (migration 079). A simulação PRECISA ler o
   * mesmo nível da medição real: senão ela prometeria um número e a medição
   * entregaria outro, que é justamente o que o transbordo veio evitar.
   */
  const nivelPorGrupoSim: Record<string, NivelApuracao> = {}
  if (detIdsRelevantes.length > 0) {
    const { data: dets } = await admin
      .from('detalhamentos')
      .select('id, tarefa_id, tarefa:tarefas ( grupo_macro_id )')
      .in('id', detIdsRelevantes)
    for (const d of (dets || []) as any[]) {
      const grupo = d.tarefa?.grupo_macro_id
      if (d.id && grupo) grupoPorDet[d.id] = grupo
      if (d.id && d.tarefa_id) tarefaPorDet[d.id] = d.tarefa_id
    }
    const grupoIdsSim = Array.from(new Set(Object.values(grupoPorDet)))
    if (grupoIdsSim.length > 0) {
      const res = await admin
        .from('grupos_macro')
        .select('id, nivel_apuracao_nf')
        .in('id', grupoIdsSim)
      // Migration 079 pendente: silencia e todo grupo cai no padrão 'grupo'.
      if (!res.error) {
        for (const g of (res.data || []) as any[]) {
          if (g?.id && g.nivel_apuracao_nf === 'tarefa') nivelPorGrupoSim[g.id] = 'tarefa'
        }
      }
    }
  }

  const medidoPorDet = new Map<string, number>()
  for (const item of itensValidos) {
    const det = detMap.get(item.detalhamento_id)
    if (!det) continue
    medidoPorDet.set(
      det.id,
      Number(item.quantidade_medida || 0) * Number(det.valor_material_unit || 0),
    )
  }

  // Mesmo balde da medição real, senão a simulação prometeria um número e a
  // medição entregaria outro.
  const descontoSimulado = calcularDescontoComTransbordo(
    detIdsRelevantes.map(detId => ({
      detalhamentoId: detId,
      tarefaId: tarefaPorDet[detId] ?? null,
      nivelApuracao: nivelPorGrupoSim[grupoPorDet[detId] ?? ''] ?? null,
      grupoId: grupoPorDet[detId] ?? null,
      matMedido: medidoPorDet.get(detId) ?? 0,
      matAcumulado: (matAcumAprovadoPorDet[detId] || 0) + (medidoPorDet.get(detId) ?? 0),
      nfAlocada: nfAlocadaPorDet[detId] || 0,
      nfJaAbatida: nfJaAbatidaPorDet[detId] || 0,
    })),
  )

  // Gap por item, e depois a classificação "pedido aprovado x NF nova" também
  // no nível do grupo (ver calcularInformaconData).
  const gapPorDet = new Map<string, number>()
  for (const detId of detIdsRelevantes) {
    const matMedido = medidoPorDet.get(detId) ?? 0
    const nfDesc = descontoSimulado.get(detId)?.total ?? 0
    gapPorDet.set(detId, Math.max(0, matMedido - nfDesc))
  }
  const saldoAprovadoSimulado = calcularSaldoAprovadoComTransbordo(
    detIdsRelevantes.map(detId => ({
      detalhamentoId: detId,
      tarefaId: tarefaPorDet[detId] ?? null,
      nivelApuracao: nivelPorGrupoSim[grupoPorDet[detId] ?? ''] ?? null,
      grupoId: grupoPorDet[detId] ?? null,
      gapMaterial: gapPorDet.get(detId) ?? 0,
      aprovado: aprovadoPorDet[detId] || 0,
      nfAlocada: nfAlocadaPorDet[detId] || 0,
    })),
  )

  const linhas: BoletimSimuladoLinha[] = []
  for (const item of itensValidos) {
    const det = detMap.get(item.detalhamento_id)
    if (!det) continue
    const qtdMed = Number(item.quantidade_medida || 0)
    const matUnit = Number(det.valor_material_unit || 0)
    const servUnit = Number(det.valor_servico_unit || 0)
    const matMedido = qtdMed * matUnit
    const servMedido = qtdMed * servUnit

    const nfTerceiroItem = nfAlocadaPorDet[det.id] || 0
    const aprovadoItem = aprovadoPorDet[det.id] || 0
    const saldoAprovDisponivel = Math.max(0, aprovadoItem - nfTerceiroItem)
    const nfDisponivel = Math.max(0, nfTerceiroItem - (nfJaAbatidaPorDet[det.id] || 0))
    const descontoItem = descontoSimulado.get(det.id)
    const nfDescontavel = descontoItem?.total ?? Math.min(matMedido, nfDisponivel)
    const gapMaterial = Math.max(0, matMedido - nfDescontavel)
    const fatDiretoEmAberto = Math.min(
      gapMaterial,
      saldoAprovadoSimulado.get(det.id) ?? saldoAprovDisponivel,
    )
    const fipFaturar = Math.max(0, gapMaterial - fatDiretoEmAberto)
    const baseRet = matMedido + servMedido
    const retencao = baseRet * (pctRetencao / 100)

    linhas.push({
      detalhamento_id: det.id,
      codigo: det.codigo,
      descricao: det.descricao,
      unidade: det.unidade,
      quantidade_medida: qtdMed,
      material_medido: matMedido,
      servico_medido: servMedido,
      nf_material_lancada: nfDescontavel,
      fat_direto_em_aberto: fatDiretoEmAberto,
      fip_a_emitir: fipFaturar,
      base_retencao: baseRet,
      retencao,
      servico_liquido: servMedido - retencao,
    })
  }

  linhas.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

  const totais = linhas.reduce((acc, l) => ({
    material_medido: acc.material_medido + l.material_medido,
    servico_medido: acc.servico_medido + l.servico_medido,
    nf_material_lancada: acc.nf_material_lancada + l.nf_material_lancada,
    fat_direto_em_aberto: acc.fat_direto_em_aberto + l.fat_direto_em_aberto,
    fip_a_emitir: acc.fip_a_emitir + l.fip_a_emitir,
    base_retencao: acc.base_retencao + l.base_retencao,
    retencao: acc.retencao + l.retencao,
    servico_liquido: acc.servico_liquido + l.servico_liquido,
    total_medido: acc.total_medido + l.material_medido + l.servico_medido,
  }), {
    material_medido: 0, servico_medido: 0, nf_material_lancada: 0,
    fat_direto_em_aberto: 0, fip_a_emitir: 0, base_retencao: 0,
    retencao: 0, servico_liquido: 0, total_medido: 0,
  })

  return { linhas, totais, pct_retencao: pctRetencao }
}

/**
 * Monta o boletim Informakon (linhas + totais) pra uma medição.
 * Retorna `null` quando a medição não existe.
 *
 * Mantém os fallbacks de schema da rota original — resiliente a colunas
 * ausentes (mat/serv unit das migrations antigas, confirmação sem-NF da
 * 060) — pra produção e ambientes intermediários se manterem funcionais.
 */
export async function calcularInformaconData(
  admin: SupabaseClient,
  contratoId: string,
  medicaoId: string,
): Promise<InformaconData | null> {
  // 1) Medição (campos básicos)
  let { data: medicao, error: medErr } = await admin
    .from('medicoes')
    .select(`
      id, numero, periodo_referencia, status, data_aprovacao, data_submissao,
      valor_total, contrato_id, ajuste_material_anterior, ajuste_material_anterior_motivo,
      valor_material_correspondente, valor_retencao_garantia
    `)
    .eq('id', medicaoId)
    .single()
  // Migration 074 pendente: recarrega sem as colunas do ajuste/snapshot.
  if (medErr && isSchemaMissingError(medErr, [
    'ajuste_material_anterior', 'ajuste_material_anterior_motivo',
    'valor_material_correspondente', 'valor_retencao_garantia',
  ])) {
    const fb = await admin
      .from('medicoes')
      .select('id, numero, periodo_referencia, status, data_aprovacao, data_submissao, valor_total, contrato_id')
      .eq('id', medicaoId)
      .single()
    if (fb.error || !fb.data) return null
    medicao = fb.data as any
  } else if (medErr || !medicao) {
    return null
  }

  // 2) Contrato (fallback se percentual_retencao não está no schema cache)
  let contrato: any = null
  {
    const tryFull = await admin
      .from('contratos')
      .select('id, numero, descricao, valor_total, valor_servicos, percentual_retencao')
      .eq('id', (medicao as any).contrato_id)
      .single()
    if (!tryFull.error) {
      contrato = tryFull.data
    } else if (isSchemaMissingError(tryFull.error, ['percentual_retencao'])) {
      const fallback = await admin
        .from('contratos')
        .select('id, numero, descricao, valor_total, valor_servicos')
        .eq('id', (medicao as any).contrato_id)
        .single()
      if (fallback.error) throw fallback.error
      contrato = fallback.data
    } else {
      throw tryFull.error
    }
  }

  // 3) Itens da medição (3 níveis de fallback de schema)
  let medicaoItens: any[] = []
  {
    const SELECT_FULL = `
      id, quantidade_medida, valor_unitario, detalhamento_id,
      confirmacao_sem_nf, confirmacao_sem_nf_em, confirmacao_sem_nf_por_id,
      confirmacao_sem_nf_motivo,
      detalhamento:detalhamentos (
        id, codigo, descricao, unidade, quantidade_contratada,
        valor_unitario, valor_material_unit, valor_servico_unit
      )
    `
    const SELECT_SEM_CONFIRMACAO = `
      id, quantidade_medida, valor_unitario, detalhamento_id,
      detalhamento:detalhamentos (
        id, codigo, descricao, unidade, quantidade_contratada,
        valor_unitario, valor_material_unit, valor_servico_unit
      )
    `
    const SELECT_FALLBACK_FULL = `
      id, quantidade_medida, valor_unitario, detalhamento_id,
      detalhamento:detalhamentos (
        id, codigo, descricao, unidade, quantidade_contratada, valor_unitario
      )
    `

    const tryFull = await admin
      .from('medicao_itens')
      .select(SELECT_FULL)
      .eq('medicao_id', medicaoId)
    if (!tryFull.error) {
      medicaoItens = tryFull.data || []
    } else if (
      isSchemaMissingError(tryFull.error, [
        'confirmacao_sem_nf',
        'confirmacao_sem_nf_em',
        'confirmacao_sem_nf_por_id',
        'confirmacao_sem_nf_motivo',
      ])
    ) {
      const trySemConfirmacao = await admin
        .from('medicao_itens')
        .select(SELECT_SEM_CONFIRMACAO)
        .eq('medicao_id', medicaoId)
      if (!trySemConfirmacao.error) {
        medicaoItens = trySemConfirmacao.data || []
      } else if (isSchemaMissingError(trySemConfirmacao.error, ['valor_material_unit', 'valor_servico_unit'])) {
        const fallback = await admin
          .from('medicao_itens')
          .select(SELECT_FALLBACK_FULL)
          .eq('medicao_id', medicaoId)
        if (fallback.error) throw fallback.error
        medicaoItens = fallback.data || []
      } else {
        throw trySemConfirmacao.error
      }
    } else if (isSchemaMissingError(tryFull.error, ['valor_material_unit', 'valor_servico_unit'])) {
      const fallback = await admin
        .from('medicao_itens')
        .select(SELECT_FALLBACK_FULL)
        .eq('medicao_id', medicaoId)
      if (fallback.error) throw fallback.error
      medicaoItens = fallback.data || []
    } else {
      throw tryFull.error
    }
  }

  // === TODOS os detalhamentos do contrato (pra virtual rows / "mostrar todos").
  // Hierarquia: contratos → grupos_macro → tarefas → detalhamentos.
  // Query em 3 passos: grupos_macro → tarefas → detalhamentos. Defensivo:
  // se qualquer passo falhar, segue com array vazio (página continua viva).
  let todosDetalhamentos: any[] = []
  // Grupo macro de cada detalhamento — necessário pro transbordo do desconto
  // dentro do grupo (ver lib/db/desconto-transbordo.ts).
  const grupoPorDetalhamento: Record<string, string> = {}
  // Tarefa de cada detalhamento — balde alternativo, usado só nos grupos
  // fixados em 'tarefa'. Ver lib/db/desconto-transbordo.ts.
  const tarefaPorDetalhamento: Record<string, string> = {}
  // Nível de apuração de cada grupo (migration 079). Ausente = 'grupo', que é
  // o padrão e o nível em que o Informakon consolida as notas.
  const nivelPorGrupo: Record<string, NivelApuracao> = {}
  try {
    // 1) grupos_macro do contrato. `nivel_apuracao_nf` só existe após a
    //    migration 079 — sem ela todo grupo cai no padrão.
    const gruposRes = await admin
      .from('grupos_macro')
      .select('id, nivel_apuracao_nf')
      .eq('contrato_id', contratoId)
    const gruposFallback = gruposRes.error && isSchemaMissingError(gruposRes.error, ['nivel_apuracao_nf'])
      ? await admin.from('grupos_macro').select('id').eq('contrato_id', contratoId)
      : null
    const { data: gruposRows, error: gruposErr } = gruposFallback ?? gruposRes
    for (const g of (gruposRows || []) as any[]) {
      if (g?.id && g.nivel_apuracao_nf === 'tarefa') nivelPorGrupo[g.id] = 'tarefa'
    }
    if (gruposErr) {
      console.warn('[informacon] falha ao buscar grupos_macro:', gruposErr.message)
    } else {
      const grupoIds = (gruposRows || []).map((g: any) => g.id).filter(Boolean)
      if (grupoIds.length > 0) {
        // 2) tarefas dos grupos
        const { data: tarefasRows, error: tarefasErr } = await admin
          .from('tarefas')
          .select('id, grupo_macro_id')
          .in('grupo_macro_id', grupoIds)
        if (tarefasErr) {
          console.warn('[informacon] falha ao buscar tarefas:', tarefasErr.message)
        } else {
          const grupoPorTarefa: Record<string, string> = {}
          for (const t of (tarefasRows || []) as any[]) {
            if (t.id && t.grupo_macro_id) grupoPorTarefa[t.id] = t.grupo_macro_id
          }
          const tarefaIds = (tarefasRows || []).map((t: any) => t.id).filter(Boolean)
          if (tarefaIds.length > 0) {
            // 3) detalhamentos das tarefas
            const tryFull = await admin
              .from('detalhamentos')
              .select(`
                id, codigo, descricao, unidade, quantidade_contratada, tarefa_id,
                valor_unitario, valor_material_unit, valor_servico_unit
              `)
              .in('tarefa_id', tarefaIds)
            if (!tryFull.error && tryFull.data) {
              todosDetalhamentos = tryFull.data
            } else if (tryFull.error && isSchemaMissingError(tryFull.error, ['valor_material_unit', 'valor_servico_unit'])) {
              const fallback = await admin
                .from('detalhamentos')
                .select('id, codigo, descricao, unidade, quantidade_contratada, tarefa_id, valor_unitario')
                .in('tarefa_id', tarefaIds)
              if (!fallback.error && fallback.data) {
                todosDetalhamentos = fallback.data
              } else if (fallback.error) {
                console.warn('[informacon] fallback detalhamentos falhou:', fallback.error.message)
              }
            } else if (tryFull.error) {
              console.warn('[informacon] falha ao buscar detalhamentos:', tryFull.error.message)
            }
            for (const d of todosDetalhamentos as any[]) {
              const grupo = d.tarefa_id ? grupoPorTarefa[d.tarefa_id] : undefined
              if (d.id && grupo) grupoPorDetalhamento[d.id] = grupo
              if (d.id && d.tarefa_id) tarefaPorDetalhamento[d.id] = d.tarefa_id
            }
          }
        }
      }
    }
  } catch (e: any) {
    console.warn('[informacon] erro inesperado ao buscar detalhamentos:', e?.message)
  }

  // Acumulado de quantidade por detalhamento
  const { data: medicoesDoContrato } = await admin
    .from('medicoes')
    .select('id, status')
    .eq('contrato_id', contratoId)

  const idsValidas = new Set(
    (medicoesDoContrato || [])
      .filter((m: any) => m.status === 'aprovado' || m.id === medicaoId)
      .map((m: any) => m.id),
  )

  const acumulado: Record<string, number> = {}
  if (idsValidas.size > 0) {
    const { data: acumRows } = await admin
      .from('medicao_itens')
      .select('detalhamento_id, quantidade_medida, medicao_id')
      .in('medicao_id', Array.from(idsValidas))
    for (const r of (acumRows || []) as any[]) {
      const detId = r.detalhamento_id
      if (!detId) continue
      acumulado[detId] = (acumulado[detId] || 0) + Number(r.quantidade_medida || 0)
    }
  }

  // Preço de material por detalhamento — usado para converter a quantidade
  // acumulada em material acumulado (o teto da régua acumulada do desconto).
  const matUnitPorDet: Record<string, number> = {}
  for (const d of todosDetalhamentos as any[]) {
    if (d?.id) matUnitPorDet[d.id] = Number(d.valor_material_unit || 0)
  }
  for (const it of (medicaoItens || []) as any[]) {
    const det = it.detalhamento
    if (det?.id && matUnitPorDet[det.id] === undefined) {
      matUnitPorDet[det.id] = Number(det.valor_material_unit || 0)
    }
  }
  const matAcumuladoDe = (detId: string) =>
    (acumulado[detId] || 0) * (matUnitPorDet[detId] || 0)

  const pctRetencao = Number(contrato?.percentual_retencao ?? 5)

  // Saldo corrido: o que já foi abatido nas medições aprovadas anteriores
  // (migration 074). Sem isto a mesma NF volta a ser descontável todo mês.
  const nfJaAbatidaPorDet = await carregarNfJaAbatida(
    admin,
    (medicoesDoContrato || [])
      .filter((m: any) => m.status === 'aprovado' && m.id !== medicaoId)
      .map((m: any) => m.id),
  )

  // 4) Solicitações fat-direto APROVADAS + NFs alocadas por detalhamento
  const aprovadoPorDet: Record<string, number> = {}
  const nfAlocadaPorDet: Record<string, number> = {}
  {
    const SELECT_SOL = `
        id, status, deletado_em, fornecedor_cnpj, fornecedor_razao_social,
        itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
        nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
    `
    let solRaw: any[] = []
    {
      const tryFull = await admin
        .from('solicitacoes_fat_direto')
        .select(`tipo, ${SELECT_SOL}`)
        .eq('contrato_id', contratoId)
        .eq('status', 'aprovado')
        .is('deletado_em', null)
      if (!tryFull.error) {
        solRaw = tryFull.data || []
      } else if (isSchemaMissingError(tryFull.error, ['tipo'])) {
        const fallback = await admin
          .from('solicitacoes_fat_direto')
          .select(SELECT_SOL)
          .eq('contrato_id', contratoId)
          .eq('status', 'aprovado')
          .is('deletado_em', null)
        if (fallback.error) throw fallback.error
        solRaw = fallback.data || []
      } else {
        throw tryFull.error
      }
    }

    for (const sol of solRaw as any[]) {
      // NF de SERVIÇO da Wave não abate material — ela É o faturamento da
      // Wave, não uma nota de material de terceiro.
      if (ehPedidoDeServicoWave(sol)) continue
      const itens = (sol.itens || []) as any[]
      const itensVal = itens.map(it => ({
        detId: it.detalhamento_id as string | null,
        valor: Number(it.valor_total || 0),
      })).filter(x => x.detId)

      const totalSol = itensVal.reduce((s, it) => s + it.valor, 0)
      for (const it of itensVal) {
        aprovadoPorDet[it.detId!] = (aprovadoPorDet[it.detId!] || 0) + it.valor
      }

      // NF cancelada não reserva saldo (lib/db/nf-status.ts) e portanto não
      // pode descontar material. O `status` já vinha no SELECT acima mas nunca
      // era lido: uma nota cancelada inflava o NF Desc., encolhia o Gap, e o
      // erro virava snapshot definitivo na aprovação da medição. `lib/db/origem.ts`
      // sempre filtrou — este era o caminho que faltava.
      const totalNfsSol = ((sol.nfs || []) as any[])
        .filter((nf: any) => nfReservaSaldo(nf?.status))
        .reduce((s: number, nf: any) => s + Number(nf.valor || 0), 0)

      if (totalSol > 0 && totalNfsSol > 0) {
        for (const it of itensVal) {
          const share = it.valor / totalSol
          nfAlocadaPorDet[it.detId!] = (nfAlocadaPorDet[it.detId!] || 0) + totalNfsSol * share
        }
      }
    }
  }

  // === Medição aprovada: o boletim mostra o que foi aprovado ===
  //
  // O boletim recalcula ao vivo a cada abertura. Numa medição já aprovada e
  // paga isso é errado: mudanças posteriores — NF lançada depois, ou uma
  // mudança na própria regra de desconto, como o transbordo por grupo — fariam
  // a tela exibir números diferentes dos que foram aprovados, assinados e
  // enviados por e-mail. `medicao_itens.nf_material_descontada` guarda o
  // snapshot gravado na aprovação (migration 074); quando ele existe, é ele
  // que manda. Mesmo padrão de lib/db/resumo-financeiro-obra.ts.
  const snapshotAprovado = await (async () => {
    if ((medicao as any).status !== 'aprovado') return null
    const snap = await carregarNfJaAbatida(admin, [medicaoId])
    // Medição aprovada antes da migration 074 não tem snapshot — aí recalcula.
    const temValor = Object.values(snap).some(v => Number(v) > 0)
    return temValor ? snap : null
  })()


  // === Transbordo do desconto dentro da tarefa ===
  // A NF fica alocada ao seu detalhamento, mas o saldo ocioso cobre o material
  // medido dos vizinhos da mesma tarefa. Sem isto, material comprado por lote
  // (prumada) e medido por pavimento aparece como "sem NF" enquanto a nota
  // está parada ao lado. Ver lib/db/desconto-transbordo.ts.
  //
  // O pool considera TODOS os detalhamentos do contrato com NF alocada — não
  // só os medidos nesta medição —, porque é justamente na nota de um item
  // ainda não medido que costuma estar o saldo.
  //
  // Além dos detalhamentos com NF, entram também os que já foram medidos em
  // medições anteriores: é o material acumulado deles que forma o teto da
  // régua da tarefa.
  const descontoPorDet = (() => {
    const vistos = new Set<string>()
    const itensDesconto: ItemDesconto[] = []

    for (const it of (medicaoItens || []) as any[]) {
      const det = it.detalhamento
      if (!det?.id) continue
      vistos.add(det.id)
      const matMedido = Number(it.quantidade_medida || 0) * Number(det.valor_material_unit || 0)
      itensDesconto.push({
        detalhamentoId: det.id,
        tarefaId: tarefaPorDetalhamento[det.id] ?? null,
        nivelApuracao: nivelPorGrupo[grupoPorDetalhamento[det.id] ?? ''] ?? null,
        grupoId: grupoPorDetalhamento[det.id] ?? null,
        matMedido,
        matAcumulado: matAcumuladoDe(det.id),
        nfAlocada: nfAlocadaPorDet[det.id] || 0,
        nfJaAbatida: nfJaAbatidaPorDet[det.id] || 0,
      })
    }

    // Detalhamentos fora desta medição: entram com matMedido = 0 e não recebem
    // desconto, mas somam NF e material acumulado ao balde do grupo.
    for (const detId of new Set([...Object.keys(nfAlocadaPorDet), ...Object.keys(acumulado)])) {
      if (vistos.has(detId)) continue
      itensDesconto.push({
        detalhamentoId: detId,
        tarefaId: tarefaPorDetalhamento[detId] ?? null,
        nivelApuracao: nivelPorGrupo[grupoPorDetalhamento[detId] ?? ''] ?? null,
        grupoId: grupoPorDetalhamento[detId] ?? null,
        matMedido: 0,
        matAcumulado: matAcumuladoDe(detId),
        nfAlocada: nfAlocadaPorDet[detId] || 0,
        nfJaAbatida: nfJaAbatidaPorDet[detId] || 0,
      })
    }

    return calcularDescontoComTransbordo(itensDesconto)
  })()

  // === Desconto e gap por detalhamento, apurados antes das linhas ===
  //
  // A classificação do gap ("pedido aprovado, NF pendente" x "FIP a criar")
  // precisa do gap de TODOS os itens do grupo antes de decidir o de cada um —
  // por isso este passo vem separado do map que monta as linhas.
  const calculoPorDet = new Map<string, {
    nfDescontavel: number
    nfTransbordo: number
    nfRecuperacao: number
    gapMaterial: number
  }>()
  for (const it of (medicaoItens || []) as any[]) {
    const det = it.detalhamento
    if (!det?.id) continue
    const matMedido = Number(it.quantidade_medida || 0) * Number(det.valor_material_unit || 0)
    const nfDisponivel = Math.max(
      0,
      (nfAlocadaPorDet[det.id] || 0) - (nfJaAbatidaPorDet[det.id] || 0),
    )
    const desconto = descontoPorDet.get(det.id)
    const calculado = desconto?.total ?? Math.min(matMedido, nfDisponivel)
    // Medição aprovada: vale o que foi gravado na aprovação, não o recálculo.
    const nfDescontavel = snapshotAprovado
      ? Number(snapshotAprovado[det.id] ?? 0)
      : calculado
    calculoPorDet.set(det.id, {
      nfDescontavel,
      nfTransbordo: snapshotAprovado ? 0 : (desconto?.transbordo ?? 0),
      nfRecuperacao: snapshotAprovado
        ? Math.max(0, nfDescontavel - matMedido)
        : (desconto?.recuperacao ?? 0),
      gapMaterial: Math.max(0, matMedido - nfDescontavel),
    })
  }

  // Pedido aprovado sem NF, com transbordo dentro da tarefa. A FIP compra
  // por lote: o pedido costuma estar alocado a um detalhamento diferente do
  // medido, e sem isto o sistema pede "NF nova" para material já comprado.
  const saldoAprovadoPorDet = (() => {
    const vistos = new Set<string>()
    const entrada: ItemSaldoAprovado[] = []
    for (const [detId, c] of calculoPorDet) {
      vistos.add(detId)
      entrada.push({
        detalhamentoId: detId,
        tarefaId: tarefaPorDetalhamento[detId] ?? null,
        nivelApuracao: nivelPorGrupo[grupoPorDetalhamento[detId] ?? ''] ?? null,
        grupoId: grupoPorDetalhamento[detId] ?? null,
        gapMaterial: c.gapMaterial,
        aprovado: aprovadoPorDet[detId] || 0,
        nfAlocada: nfAlocadaPorDet[detId] || 0,
      })
    }
    for (const detId of Object.keys(aprovadoPorDet)) {
      if (vistos.has(detId)) continue
      entrada.push({
        detalhamentoId: detId,
        tarefaId: tarefaPorDetalhamento[detId] ?? null,
        nivelApuracao: nivelPorGrupo[grupoPorDetalhamento[detId] ?? ''] ?? null,
        grupoId: grupoPorDetalhamento[detId] ?? null,
        gapMaterial: 0,
        aprovado: aprovadoPorDet[detId] || 0,
        nfAlocada: nfAlocadaPorDet[detId] || 0,
      })
    }
    return calcularSaldoAprovadoComTransbordo(entrada)
  })()

  // Monta linhas
  const linhas: InformaconLinha[] = (medicaoItens || [])
    .map((it: any) => {
      const det = it.detalhamento
      if (!det) return null
      const qtdContr = Number(det.quantidade_contratada || 0)
      const qtdMed = Number(it.quantidade_medida || 0)
      const matUnit = Number(det.valor_material_unit || 0)
      const servUnit = Number(det.valor_servico_unit || 0)
      const valorUnit = Number(det.valor_unitario || (matUnit + servUnit))
      const matMedido = qtdMed * matUnit
      const servMedido = qtdMed * servUnit
      const qtdAcum = acumulado[det.id] || 0

      const nfTerceiroItem = nfAlocadaPorDet[det.id] || 0
      const aprovadoItem = aprovadoPorDet[det.id] || 0
      const saldoAprovDisponivel = Math.max(0, aprovadoItem - nfTerceiroItem)

      // Saldo corrido (migration 074): a NF já abatida em medições aprovadas
      // anteriores não volta a descontar. Uma nota que não foi abatida no mês
      // certo continua no saldo e aparece na medição seguinte.
      const nfJaAbatida  = nfJaAbatidaPorDet[det.id] || 0
      const nfDisponivel = Math.max(0, nfTerceiroItem - nfJaAbatida)

      // Desconto acumulado com transbordo (ver lib/db/desconto-transbordo.ts).
      const c = calculoPorDet.get(det.id)
      const nfDescontavel  = c?.nfDescontavel ?? 0
      const nfTransbordo   = c?.nfTransbordo ?? 0
      const nfRecuperacao  = c?.nfRecuperacao ?? 0
      const gapMaterial    = c?.gapMaterial ?? 0
      const faturamentoDiretoEmAberto = Math.min(
        gapMaterial,
        saldoAprovadoPorDet.get(det.id) ?? saldoAprovDisponivel,
      )
      const fipFaturar     = Math.max(0, gapMaterial - faturamentoDiretoEmAberto)

      const valorGlobalItem = qtdContr * valorUnit
      const valorServicoTotalItem = qtdContr * servUnit

      const pctServMed = qtdContr > 0 ? (qtdMed / qtdContr) * 100 : 0

      const confirmacaoSemNf = Boolean(it.confirmacao_sem_nf)
      const ajusteAplicado = confirmacaoSemNf && faturamentoDiretoEmAberto > 0

      const pctServMedAjustado = ajusteAplicado && valorServicoTotalItem > 0
        ? Math.max(0, pctServMed - (faturamentoDiretoEmAberto / valorServicoTotalItem) * 100)
        : pctServMed

      const waveServico = (pctServMedAjustado / 100) * valorServicoTotalItem
      const valorTotalMedido = (pctServMedAjustado / 100) * valorServicoTotalItem
      // dados_informakon = o total que o relatório do Informakon mostra para
      // este item: serviço da Wave + material medido.
      //
      // Antes subtraía `faturamento_direto_em_aberto`. Estava errado por dois
      // motivos. Primeiro, o espelho da medição 004 fecha em 805.522,67 — o
      // total medido inteiro, sem dedução de pedido sem NF; o Informakon
      // registra o que foi executado, não o que já virou nota. Segundo, quando
      // há confirmação "sem mais NF" o `waveServico` JÁ foi reduzido em
      // `faturamento_direto_em_aberto` via pctServMedAjustado — subtrair de
      // novo descontava duas vezes o mesmo valor.
      //
      // O problema só ficou visível quando o transbordo por grupo passou a
      // classificar R$ 7.207,99 como pedido aprovado sem NF, valor que antes
      // era zero nesta obra.
      const dadosInformakon = waveServico + matMedido
      const pctInformakon = valorGlobalItem > 0 ? (dadosInformakon / valorGlobalItem) * 100 : 0

      // ── % A LANÇAR — corrigido para não pagar o Gap ────────────────────
      //
      // `dadosInformakon` acima é o ESPELHO: o que o relatório do Informakon
      // mostra como executado. Não serve para lançar, e é aí que estava o
      // vazamento de dinheiro.
      //
      // Mecânica do Informakon (confirmada pelo usuário): ao receber um
      // percentual ele LIBERA `% × valor global do item` e depois desconta as
      // notas de material lançadas LÁ — nada mais. Ele não conhece nosso
      // "saldo de pedido aprovado".
      //
      //     Wave recebe = % × valor global − NF lançada no Informakon
      //
      // Lançar o % físico (100% quando o item está 100% medido) faz o
      // Informakon liberar o material INTEIRO e descontar só o que virou nota
      // — ou seja, paga à Wave o Gap (Retido + FIP Fat-Dir): material que
      // ainda não tem nota de terceiro e cujo dinheiro não é dela.
      //
      // Isolando o % que entrega exatamente o serviço medido:
      //
      //     % × global − nfDescontavel = waveServico
      //     % = (waveServico + nfDescontavel) / global × 100
      //
      // O serviço continua pago pelo % medido integral — a correção sai toda
      // do lado do material, que é onde o problema está.
      const informakonALancar = waveServico + nfDescontavel
      const pctInformakonALancar = valorGlobalItem > 0
        ? (informakonALancar / valorGlobalItem) * 100
        : 0
      // Quanto o espelho tem a mais (ou a menos) que o valor a liberar.
      // Positivo = Gap segurado (Retido + FIP Fat-Dir), que é o caso comum.
      // Negativo = nota de meses anteriores voltando pela régua acumulada:
      // aí é preciso liberar MAIS que o executado no período, senão o
      // desconto do Informakon deixaria a Wave no negativo.
      const correcaoInformakon = dadosInformakon - informakonALancar
      // O valor do item só é "alterado por retido" quando a confirmação sem NF
      // efetivamente reduziu o percentual de serviço.
      const alteradoPorRetido = ajusteAplicado
      // Base de retenção: SOMA do que foi executado fisicamente nesta medição
      // = mat_medido + serv_medido. Não subtrai 'fat-direto em aberto' porque
      // todo material executado já está sob nossa posse e deve reter 5% pra
      // garantia financeira. (spec 2026-05-06)
      const baseRet = matMedido + waveServico
      const retencao5pct = baseRet * (pctRetencao / 100)

      const linha: InformaconLinha = {
        medicao_item_id: it.id,
        existe_no_banco: true,
        detalhamento_id: det.id,
        tarefa_id: tarefaPorDetalhamento[det.id] ?? null,
        codigo: det.codigo,
        codigo_informakon: getCodigoInformakon(det.descricao),
        descricao: det.descricao,
        unidade: det.unidade,
        quantidade_contratada: qtdContr,
        quantidade_medida: qtdMed,
        quantidade_acumulada: qtdAcum,
        pct_medido: pctServMedAjustado,
        pct_acumulado: qtdContr > 0 ? (qtdAcum / qtdContr) * 100 : 0,
        valor_unitario: valorUnit,
        valor_material_unit: matUnit,
        valor_servico_unit: servUnit,
        valor_total_item: valorGlobalItem,
        valor_material_total_item: qtdContr * matUnit,
        valor_servico_total_item: valorServicoTotalItem,
        material_medido: matMedido,
        servico_medido: servMedido,
        nf_terceiro: nfTerceiroItem,
        nf_ja_abatida: nfJaAbatida,
        nf_disponivel: nfDisponivel,
        saldo_aprovado: saldoAprovDisponivel,
        nf_descontavel: nfDescontavel,
        nf_transbordo_grupo: nfTransbordo,
        nf_recuperacao_anterior: nfRecuperacao,
        gap_material: gapMaterial,
        faturamento_direto_em_aberto: faturamentoDiretoEmAberto,
        fip_faturar: fipFaturar,
        wave_servico: waveServico,
        valor_total_medido: valorTotalMedido,
        dados_informakon: dadosInformakon,
        total_informakon: dadosInformakon,
        pct_informakon: pctInformakon,
        informakon_a_lancar: informakonALancar,
        pct_informakon_a_lancar: pctInformakonALancar,
        correcao_informakon: correcaoInformakon,
        alterado_por_retido: alteradoPorRetido,
        base_retencao: baseRet,
        retencao: retencao5pct,
        pct_serv_med_original: pctServMed,
        pct_serv_med: pctServMedAjustado,
        ajuste_aplicado: ajusteAplicado,
        confirmacao_sem_nf: confirmacaoSemNf,
        confirmacao_sem_nf_em: it.confirmacao_sem_nf_em ?? null,
        confirmacao_sem_nf_motivo: it.confirmacao_sem_nf_motivo ?? null,
        material_acumulado: qtdAcum * matUnit,
        servico_acumulado: qtdAcum * servUnit,
        ajustes_admin: [],
        foi_ajustado_pelo_admin: false,
      }
      return linha
    })
    .filter((x): x is InformaconLinha => x !== null)

  // === Virtual rows: detalhamentos do contrato sem medicao_item correspondente.
  // Aparecem com qty=0 (e zero em todos os derivados), `existe_no_banco=false`
  // e `medicao_item_id=null`. UI permite "Ajustar" — backend cria o row no
  // banco quando o admin salva o ajuste. ===
  const detsComMedicao = new Set(linhas.map(l => l.detalhamento_id))
  for (const det of (todosDetalhamentos || []) as any[]) {
    if (detsComMedicao.has(det.id)) continue
    const qtdContr = Number(det.quantidade_contratada || 0)
    const matUnit = Number(det.valor_material_unit || 0)
    const servUnit = Number(det.valor_servico_unit || 0)
    const valorUnit = Number(det.valor_unitario || (matUnit + servUnit))
    const valorGlobalItem = qtdContr * valorUnit
    const valorServicoTotalItem = qtdContr * servUnit
    const qtdAcum = acumulado[det.id] || 0
    const linhaVirtual: InformaconLinha = {
      medicao_item_id: null,
      existe_no_banco: false,
      detalhamento_id: det.id,
      tarefa_id: tarefaPorDetalhamento[det.id] ?? null,
      codigo: det.codigo,
      codigo_informakon: getCodigoInformakon(det.descricao),
      descricao: det.descricao,
      unidade: det.unidade,
      quantidade_contratada: qtdContr,
      quantidade_medida: 0,
      quantidade_acumulada: qtdAcum,
      pct_medido: 0,
      pct_acumulado: qtdContr > 0 ? (qtdAcum / qtdContr) * 100 : 0,
      valor_unitario: valorUnit,
      valor_material_unit: matUnit,
      valor_servico_unit: servUnit,
      valor_total_item: valorGlobalItem,
      valor_material_total_item: qtdContr * matUnit,
      valor_servico_total_item: valorServicoTotalItem,
      material_medido: 0,
      servico_medido: 0,
      nf_terceiro: 0,
      nf_ja_abatida: nfJaAbatidaPorDet[det.id] || 0,
      nf_disponivel: Math.max(0, (nfAlocadaPorDet[det.id] || 0) - (nfJaAbatidaPorDet[det.id] || 0)),
      saldo_aprovado: Math.max(0, (aprovadoPorDet[det.id] || 0) - (nfAlocadaPorDet[det.id] || 0)),
      nf_descontavel: 0,
      nf_transbordo_grupo: 0,
      nf_recuperacao_anterior: 0,
      gap_material: 0,
      faturamento_direto_em_aberto: 0,
      fip_faturar: 0,
      wave_servico: 0,
      valor_total_medido: 0,
      dados_informakon: 0,
      total_informakon: 0,
      pct_informakon: 0,
      alterado_por_retido: false,
      base_retencao: 0,
      retencao: 0,
      pct_serv_med_original: 0,
      pct_serv_med: 0,
      ajuste_aplicado: false,
      confirmacao_sem_nf: false,
      confirmacao_sem_nf_em: null,
      confirmacao_sem_nf_motivo: null,
      material_acumulado: qtdAcum * matUnit,
      servico_acumulado: qtdAcum * servUnit,
      ajustes_admin: [],
      foi_ajustado_pelo_admin: false,
    }
    linhas.push(linhaVirtual)
  }

  linhas.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

  const totais: InformaconTotais = linhas.reduce<InformaconTotais>((acc, l) => ({
    material_medido: acc.material_medido + l.material_medido,
    servico_medido:  acc.servico_medido  + l.servico_medido,
    nf_terceiro:     acc.nf_terceiro     + l.nf_terceiro,
    saldo_aprovado:  acc.saldo_aprovado  + l.saldo_aprovado,
    nf_descontavel:  acc.nf_descontavel  + l.nf_descontavel,
    nf_transbordo_grupo: acc.nf_transbordo_grupo + l.nf_transbordo_grupo,
    nf_recuperacao_anterior: acc.nf_recuperacao_anterior + l.nf_recuperacao_anterior,
    gap_material:    acc.gap_material    + l.gap_material,
    faturamento_direto_em_aberto: acc.faturamento_direto_em_aberto + l.faturamento_direto_em_aberto,
    fip_faturar:     acc.fip_faturar     + l.fip_faturar,
    wave_servico:    acc.wave_servico    + l.wave_servico,
    valor_total_medido: acc.valor_total_medido + l.valor_total_medido,
    dados_informakon: acc.dados_informakon + l.dados_informakon,
    total_informakon: acc.total_informakon + l.total_informakon,
    informakon_a_lancar: acc.informakon_a_lancar + Number(l.informakon_a_lancar || 0),
    correcao_informakon: acc.correcao_informakon + Number(l.correcao_informakon || 0),
    base_retencao:   acc.base_retencao   + l.base_retencao,
    retencao:        acc.retencao        + l.retencao,
    material_acumulado: acc.material_acumulado + l.material_acumulado,
    servico_acumulado:  acc.servico_acumulado  + l.servico_acumulado,
    itens_com_ajuste: acc.itens_com_ajuste + (l.ajuste_aplicado ? 1 : 0),
    // Não são somatórios de linha — preenchidos logo abaixo do reduce.
    ajuste_material_anterior: acc.ajuste_material_anterior,
    ajuste_material_anterior_motivo: acc.ajuste_material_anterior_motivo,
    servico_liquido: 0,
  }), {
    material_medido: 0, servico_medido: 0,
    nf_terceiro: 0, saldo_aprovado: 0, nf_descontavel: 0, nf_transbordo_grupo: 0,
    nf_recuperacao_anterior: 0, gap_material: 0,
    faturamento_direto_em_aberto: 0, fip_faturar: 0, wave_servico: 0,
    valor_total_medido: 0, dados_informakon: 0, total_informakon: 0,
    informakon_a_lancar: 0, correcao_informakon: 0,
    base_retencao: 0, retencao: 0,
    material_acumulado: 0, servico_acumulado: 0,
    ajuste_material_anterior: Number((medicao as any).ajuste_material_anterior || 0),
    ajuste_material_anterior_motivo: (medicao as any).ajuste_material_anterior_motivo ?? null,
    servico_liquido: 0,
    itens_com_ajuste: 0,
  })

  // Ajustes do admin (migration 061). Se a tabela não existe, segue sem
  // ajustes — código resiliente. Apenas linhas com medicao_item_id real
  // (não-virtual) podem ter ajustes.
  const ajustesPorItem = new Map<string, AjusteAdmin[]>()
  const itemIdsReais = linhas
    .map(l => l.medicao_item_id)
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
  if (itemIdsReais.length > 0) {
    const { data: ajustesRaw, error: ajustesErr } = await admin
      .from('medicao_item_ajustes')
      .select(`
        medicao_item_id,
        quantidade_anterior,
        quantidade_nova,
        motivo,
        ajustado_em,
        ajustado_por:perfis ( nome )
      `)
      .in('medicao_item_id', itemIdsReais)
      .order('ajustado_em', { ascending: true })

    if (!ajustesErr && ajustesRaw) {
      for (const a of ajustesRaw as any[]) {
        const ajuste: AjusteAdmin = {
          quantidade_anterior: Number(a.quantidade_anterior),
          quantidade_nova: Number(a.quantidade_nova),
          motivo: String(a.motivo ?? ''),
          ajustado_em: String(a.ajustado_em ?? ''),
          ajustado_por_nome: a.ajustado_por?.nome ?? null,
        }
        const arr = ajustesPorItem.get(a.medicao_item_id) ?? []
        arr.push(ajuste)
        ajustesPorItem.set(a.medicao_item_id, arr)
      }
    }
  }
  for (const linha of linhas) {
    if (!linha.medicao_item_id) continue
    const lista = ajustesPorItem.get(linha.medicao_item_id) ?? []
    linha.ajustes_admin = lista
    linha.foi_ajustado_pelo_admin = lista.length > 0
  }

  // === Trava os TOTAIS de uma medição aprovada no que foi congelado na
  // aprovação (`aprovarMedicao`, lib/db/medicoes.ts) ===
  //
  // Uma primeira tentativa deste fix travava por ITEM, usando
  // `medicao_itens.valor_material_correspondente/valor_servico_correspondente`.
  // Zerou a MED-003: essas colunas por item nunca foram escritas de forma
  // confiável (aparentam ter sido adicionadas ao código de aprovação depois
  // que a 003 já tinha sido aprovada, então ficaram em 0 — não `null` —, o
  // que passou pela checagem e travou os totais em zero).
  //
  // O nível de MEDIÇÃO é confiável: `medicoes.valor_material_correspondente`
  // e `valor_total` já foram conferidos contra a régua da FIP (scripts
  // 081/082) e batem ao centavo pra MED-003 e MED-004. É esta fonte que
  // trava aqui — nunca mais muda depois de aprovada, mesmo que o preço
  // unitário de um detalhamento seja editado meses depois (foi isso que
  // fez a MED-003 mostrar R$ 8.769,43 de material que não existiam na
  // aprovação).
  //
  // `matCongelado > 0` exclui medições aprovadas ANTES de esta coluna
  // existir (ex.: MED-001, MED-002) — lá o valor ficou em 0 desde sempre,
  // não há base histórica pra travar, e o cálculo ao vivo de hoje continua
  // sendo o melhor disponível.
  if ((medicao as any).status === 'aprovado') {
    const matCongelado = Number((medicao as any).valor_material_correspondente ?? NaN)
    const totalCongelado = Number((medicao as any).valor_total ?? NaN)
    if (Number.isFinite(matCongelado) && Number.isFinite(totalCongelado) && matCongelado > 0) {
      const servCongelado = Math.max(0, totalCongelado - matCongelado)
      const retCongelada = Number((medicao as any).valor_retencao_garantia ?? NaN)
      const baseCongelada = matCongelado + servCongelado
      totais.material_medido = matCongelado
      totais.servico_medido = servCongelado
      totais.wave_servico = servCongelado
      totais.base_retencao = baseCongelada
      totais.retencao = Number.isFinite(retCongelada) && retCongelada > 0
        ? retCongelada
        : baseCongelada * (pctRetencao / 100)
      totais.dados_informakon = baseCongelada
    }
  }

  // Valor da NF de serviço a emitir. Fonte única — ver InformaconTotais.
  totais.servico_liquido =
    totais.wave_servico - totais.retencao - totais.ajuste_material_anterior

  return {
    medicao: {
      id: (medicao as any).id,
      numero: (medicao as any).numero,
      periodo_referencia: (medicao as any).periodo_referencia,
      status: (medicao as any).status,
      data_aprovacao: (medicao as any).data_aprovacao,
      data_submissao: (medicao as any).data_submissao,
      contrato: {
        id: contrato?.id,
        numero: contrato?.numero,
        valor_total: Number(contrato?.valor_total || 0),
        percentual_retencao: pctRetencao,
      },
    },
    linhas,
    totais,
  }
}
