import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { getCodigoInformakon } from '@/lib/data/informakon-codigos'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/informacon
 *
 * Retorna o "boletim INFORMAKON" — uma planilha-resumo da medição com,
 * por subitem (detalhamento):
 *   - código, descrição, local, unidade
 *   - quantidade contratada, quantidade medida nesta, % desta medição
 *   - acumulado de quantidade/percentual (medições aprovadas anteriores + esta)
 *   - valor unitário material / serviço
 *   - material medido / serviço medido (desta medição)
 *   - material acumulado / serviço acumulado (todas medições)
 *   - retenção por item (5% × (mat + serv) desta medição)
 *
 * Usado pela página /informacon pra lançamento manual no sistema interno.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()

    // Carrega medição em 3 etapas separadas pra ser resiliente a colunas
    // ausentes no schema cache (migrations 011/051 podem estar pendentes)
    // — em vez de uma query monolítica que falha inteira, monta progressivamente.

    // 1) Medição (campos básicos)
    const { data: medicao, error: medErr } = await admin
      .from('medicoes')
      .select('id, numero, periodo_referencia, status, data_aprovacao, data_submissao, valor_total, contrato_id')
      .eq('id', medicaoId)
      .single()
    if (medErr) {
      // medição realmente não encontrada
      return NextResponse.json({ error: 'Medição não encontrada', detail: medErr.message }, { status: 404 })
    }
    if (!medicao) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })

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

    // 3) Itens da medição (com detalhamentos — 3 níveis de fallback de schema):
    //    a) Tudo (mat/serv unit + colunas de confirmação sem-NF da migration 060)
    //    b) Sem confirmação sem-NF (060 ainda não rodou)
    //    c) Sem mat/serv unit + sem confirmação (cenário antigo)
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
        // 060 pendente — tenta sem as colunas de confirmação
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

    // Acumulado de quantidade por detalhamento (todas medições aprovadas + esta).
    // 2 queries em vez de join inline pra evitar fragilidade do PostgREST.
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

    // ================================================================
    // 4) Solicitações fat-direto APROVADAS do contrato + NFs vinculadas
    //    Para cada item de solicitação (com detalhamento_id):
    //      - aprovado total → vira "saldo aprovado bruto" do item
    //      - NF lançada da solicitação é alocada proporcionalmente entre
    //        os itens (por valor_total dentro da solicitação)
    //    Resultado por detalhamento_id:
    //      - aprovado_total[detId]  : ∑ valor_total dos itens aprovados
    //      - nf_alocada[detId]      : ∑ NFs alocadas proporcionalmente
    //    "Saldo aprovado disponível" = aprovado_total − nf_alocada
    // ================================================================
    const aprovadoPorDet: Record<string, number> = {}
    const nfAlocadaPorDet: Record<string, number> = {}
    {
      // Hint !solicitacao_id é obrigatório desde a migration 054 — antes
      // havia só uma FK entre solicitacoes_fat_direto e notas_fiscais_fat_direto,
      // mas a 054 adicionou origem_divergencia_nf_id criando ambiguidade.
      // Sem o hint, PostgREST devolve PGRST201 e zera todos os agregados.
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

        // soma NFs da solicitação (qualquer status — pendente/validada conta como "lançada")
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
    const linhas = (medicaoItens || [])
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

        // === Lógica Wave/FIP por item ===
        const nfTerceiroItem = nfAlocadaPorDet[det.id] || 0
        const aprovadoItem = aprovadoPorDet[det.id] || 0
        const saldoAprovDisponivel = Math.max(0, aprovadoItem - nfTerceiroItem)

        const nfDescontavel  = Math.min(matMedido, nfTerceiroItem)
        const gapMaterial    = Math.max(0, matMedido - nfDescontavel)
        const materialRetido = Math.min(gapMaterial, saldoAprovDisponivel)
        const fipFaturar     = Math.max(0, gapMaterial - materialRetido)

        const valorGlobalItem = qtdContr * valorUnit
        const valorServicoTotalItem = qtdContr * servUnit

        // Pct físico de serviço medido
        const pctServMed = qtdContr > 0 ? (qtdMed / qtdContr) * 100 : 0

        // === Confirmação sem-NF: ajuste de % serv. med. ===
        // Quando o aprovador confirma "sem mais NF chegando" e ainda há
        // material retido (saldo aprovado pendente), reduz pct_serv_med
        // proporcionalmente ao retido pra fechar o vazamento de retenção:
        //   pct_ajustado = pct × (1 − retido / valor_servico_total_item)
        // Sem ajuste: pct permanece o físico.
        const confirmacaoSemNf = Boolean(it.confirmacao_sem_nf)
        const ajusteAplicado = confirmacaoSemNf && materialRetido > 0

        const pctServMedAjustado = ajusteAplicado && valorServicoTotalItem > 0
          ? Math.max(0, pctServMed - (materialRetido / valorServicoTotalItem) * 100)
          : pctServMed

        // Wave (serviço) faturado = pct_ajustado × parcela de serviço
        const waveServico = (pctServMedAjustado / 100) * valorServicoTotalItem

        // === Novas fórmulas (Ações 3 e 4) ===
        // Valor Total Medido = % serv. med. × parcela de serviço do item
        const valorTotalMedido = (pctServMedAjustado / 100) * valorServicoTotalItem

        // Dados Informakon = Valor Total Medido − Valor Retido
        const dadosInformakon = valorTotalMedido - materialRetido

        // % Informakon = Dados Informakon ÷ parcela de serviço × 100
        const pctInformakon = valorServicoTotalItem > 0
          ? (dadosInformakon / valorServicoTotalItem) * 100
          : 0

        // Retenção sobre a base já ajustada (= valor total medido).
        const baseRet = valorTotalMedido
        const retencao5pct = baseRet * (pctRetencao / 100)

        return {
          medicao_item_id: it.id,
          detalhamento_id: det.id,
          codigo: det.codigo,
          codigo_informakon: getCodigoInformakon(det.descricao),
          descricao: det.descricao,
          unidade: det.unidade,
          quantidade_contratada: qtdContr,
          quantidade_medida: qtdMed,
          quantidade_acumulada: qtdAcum,
          // pct_medido mantido como o ajustado pra a UI legacy (quem consome
          // este campo já espera o "% serv. med. visível"). pct_serv_med_original
          // expõe o físico puro pra contabilidade de fundo.
          pct_medido: pctServMedAjustado,
          pct_acumulado: qtdContr > 0 ? (qtdAcum / qtdContr) * 100 : 0,
          valor_unitario: valorUnit,
          valor_material_unit: matUnit,
          valor_servico_unit: servUnit,
          valor_total_item: valorGlobalItem,
          valor_material_total_item: qtdContr * matUnit,
          valor_servico_total_item: valorServicoTotalItem,
          // medido (físico × preços contratuais) — mantido pra UI que
          // mostra "qtd × unit"
          material_medido: matMedido,
          servico_medido: servMedido,
          // === Lógica Wave/FIP ===
          nf_terceiro: nfTerceiroItem,
          saldo_aprovado: saldoAprovDisponivel,
          nf_descontavel: nfDescontavel,
          gap_material: gapMaterial,
          material_retido: materialRetido,
          fip_faturar: fipFaturar,
          // Wave_servico: AJUSTADO quando ajuste aplicado, senão servMedido
          wave_servico: waveServico,
          valor_total_medido: valorTotalMedido,
          dados_informakon: dadosInformakon,
          // alias mantido pra compat: total_informakon = dados_informakon
          total_informakon: dadosInformakon,
          pct_informakon: pctInformakon,
          base_retencao: baseRet,
          retencao: retencao5pct,
          // === Novos campos: confirmação sem-NF ===
          pct_serv_med_original: pctServMed,
          pct_serv_med: pctServMedAjustado,
          ajuste_aplicado: ajusteAplicado,
          confirmacao_sem_nf: confirmacaoSemNf,
          confirmacao_sem_nf_em: it.confirmacao_sem_nf_em ?? null,
          confirmacao_sem_nf_motivo: it.confirmacao_sem_nf_motivo ?? null,
          // acumulado (todas medições aprovadas + esta) em R$
          material_acumulado: qtdAcum * matUnit,
          servico_acumulado: qtdAcum * servUnit,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }))

    // Totais — somatório dos AJUSTADOS (wave_servico, valor_total_medido,
    // dados_informakon, retencao, base_retencao já são os ajustados por linha).
    // material_medido e servico_medido continuam sendo o físico puro
    // (qtd × unit), pra UI que precisa do "raw" do físico.
    const totais = linhas.reduce((acc: any, l: any) => ({
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

    return NextResponse.json({
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
    })
  } catch (e: any) {
    return apiError(e)
  }
}
