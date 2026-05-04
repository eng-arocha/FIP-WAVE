// Função compartilhada que monta o "boletim Informakon" (linhas + totais)
// pra uma medição. Extraída da rota /api/.../informacon pra eliminar a
// dependência de self-fetch HTTP em outros consumidores (rota aprovar e
// email-preview) — self-fetch falha em prod no Vercel por questões de
// cookies/host/cold-start (mesmo padrão do fix de /origem em f6d3176).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { getCodigoInformakon } from '@/lib/data/informakon-codigos'

export interface AjusteAdmin {
  quantidade_anterior: number
  quantidade_nova: number
  motivo: string
  ajustado_em: string
  ajustado_por_nome: string | null
}

export interface InformaconLinha {
  medicao_item_id: string
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
  saldo_aprovado: number
  nf_descontavel: number
  gap_material: number
  material_retido: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  pct_informakon: number
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
  gap_material: number
  material_retido: number
  fip_faturar: number
  wave_servico: number
  valor_total_medido: number
  dados_informakon: number
  total_informakon: number
  base_retencao: number
  retencao: number
  material_acumulado: number
  servico_acumulado: number
  itens_com_ajuste: number
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
  const { data: medicao, error: medErr } = await admin
    .from('medicoes')
    .select('id, numero, periodo_referencia, status, data_aprovacao, data_submissao, valor_total, contrato_id')
    .eq('id', medicaoId)
    .single()
  if (medErr || !medicao) return null

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

  const pctRetencao = Number(contrato?.percentual_retencao ?? 5)

  // 4) Solicitações fat-direto APROVADAS + NFs alocadas por detalhamento
  const aprovadoPorDet: Record<string, number> = {}
  const nfAlocadaPorDet: Record<string, number> = {}
  {
    const { data: solRaw, error: solErr } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, status, deletado_em,
        itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
        nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
      `)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null)
    if (solErr) throw solErr

    for (const sol of (solRaw || []) as any[]) {
      const itens = (sol.itens || []) as any[]
      const itensVal = itens.map(it => ({
        detId: it.detalhamento_id as string | null,
        valor: Number(it.valor_total || 0),
      })).filter(x => x.detId)

      const totalSol = itensVal.reduce((s, it) => s + it.valor, 0)
      for (const it of itensVal) {
        aprovadoPorDet[it.detId!] = (aprovadoPorDet[it.detId!] || 0) + it.valor
      }

      const totalNfsSol = ((sol.nfs || []) as any[])
        .reduce((s: number, nf: any) => s + Number(nf.valor || 0), 0)

      if (totalSol > 0 && totalNfsSol > 0) {
        for (const it of itensVal) {
          const share = it.valor / totalSol
          nfAlocadaPorDet[it.detId!] = (nfAlocadaPorDet[it.detId!] || 0) + totalNfsSol * share
        }
      }
    }
  }

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

      const nfDescontavel  = Math.min(matMedido, nfTerceiroItem)
      const gapMaterial    = Math.max(0, matMedido - nfDescontavel)
      const materialRetido = Math.min(gapMaterial, saldoAprovDisponivel)
      const fipFaturar     = Math.max(0, gapMaterial - materialRetido)

      const valorGlobalItem = qtdContr * valorUnit
      const valorServicoTotalItem = qtdContr * servUnit

      const pctServMed = qtdContr > 0 ? (qtdMed / qtdContr) * 100 : 0

      const confirmacaoSemNf = Boolean(it.confirmacao_sem_nf)
      const ajusteAplicado = confirmacaoSemNf && materialRetido > 0

      const pctServMedAjustado = ajusteAplicado && valorServicoTotalItem > 0
        ? Math.max(0, pctServMed - (materialRetido / valorServicoTotalItem) * 100)
        : pctServMed

      const waveServico = (pctServMedAjustado / 100) * valorServicoTotalItem
      const valorTotalMedido = (pctServMedAjustado / 100) * valorServicoTotalItem
      const dadosInformakon = waveServico + matMedido - materialRetido
      const pctInformakon = valorGlobalItem > 0 ? (dadosInformakon / valorGlobalItem) * 100 : 0
      const alteradoPorRetido = materialRetido > 0
      // Retenção sobre o que está efetivamente sendo faturado nesta medição
      // (mat NF descontável + FIP fat-direto + serviço Wave) = dados_informakon.
      // Captura corretamente itens 100% material (ex.: grupo 19 Administração)
      // que não geram NF de serviço — antes da correção a retenção desses
      // itens dava zero porque a base era só wave_servico.
      const baseRet = dadosInformakon
      const retencao5pct = baseRet * (pctRetencao / 100)

      const linha: InformaconLinha = {
        medicao_item_id: it.id,
        detalhamento_id: det.id,
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
        saldo_aprovado: saldoAprovDisponivel,
        nf_descontavel: nfDescontavel,
        gap_material: gapMaterial,
        material_retido: materialRetido,
        fip_faturar: fipFaturar,
        wave_servico: waveServico,
        valor_total_medido: valorTotalMedido,
        dados_informakon: dadosInformakon,
        total_informakon: dadosInformakon,
        pct_informakon: pctInformakon,
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
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

  const totais: InformaconTotais = linhas.reduce<InformaconTotais>((acc, l) => ({
    material_medido: acc.material_medido + l.material_medido,
    servico_medido:  acc.servico_medido  + l.servico_medido,
    nf_terceiro:     acc.nf_terceiro     + l.nf_terceiro,
    saldo_aprovado:  acc.saldo_aprovado  + l.saldo_aprovado,
    nf_descontavel:  acc.nf_descontavel  + l.nf_descontavel,
    gap_material:    acc.gap_material    + l.gap_material,
    material_retido: acc.material_retido + l.material_retido,
    fip_faturar:     acc.fip_faturar     + l.fip_faturar,
    wave_servico:    acc.wave_servico    + l.wave_servico,
    valor_total_medido: acc.valor_total_medido + l.valor_total_medido,
    dados_informakon: acc.dados_informakon + l.dados_informakon,
    total_informakon: acc.total_informakon + l.total_informakon,
    base_retencao:   acc.base_retencao   + l.base_retencao,
    retencao:        acc.retencao        + l.retencao,
    material_acumulado: acc.material_acumulado + l.material_acumulado,
    servico_acumulado:  acc.servico_acumulado  + l.servico_acumulado,
    itens_com_ajuste: acc.itens_com_ajuste + (l.ajuste_aplicado ? 1 : 0),
  }), {
    material_medido: 0, servico_medido: 0,
    nf_terceiro: 0, saldo_aprovado: 0, nf_descontavel: 0, gap_material: 0,
    material_retido: 0, fip_faturar: 0, wave_servico: 0,
    valor_total_medido: 0, dados_informakon: 0, total_informakon: 0,
    base_retencao: 0, retencao: 0,
    material_acumulado: 0, servico_acumulado: 0,
    itens_com_ajuste: 0,
  })

  // Ajustes do admin (migration 061). Se a tabela não existe, segue sem
  // ajustes — código resiliente.
  const ajustesPorItem = new Map<string, AjusteAdmin[]>()
  if (linhas.length > 0) {
    const itemIds = linhas.map(l => l.medicao_item_id)
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
      .in('medicao_item_id', itemIds)
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
    const lista = ajustesPorItem.get(linha.medicao_item_id) ?? []
    linha.ajustes_admin = lista
    linha.foi_ajustado_pelo_admin = lista.length > 0
  }

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
