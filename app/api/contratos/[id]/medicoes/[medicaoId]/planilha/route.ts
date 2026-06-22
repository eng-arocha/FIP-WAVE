import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/planilha
 *
 * Retorna a "planilha de medição" — formato com 4 grupos de colunas:
 *   - Anterior  (acumulado de medições aprovadas ANTES desta)
 *   - Atual     (esta medição)
 *   - Total     (anterior + atual)
 *   - Saldo     (contratado - total)
 *
 * Cada grupo expõe quantidade, valor e percentual.
 *
 * Diferenças vs /informacon:
 *   - Aqui o foco é a planilha contratual com snapshot histórico:
 *     o "valor_anterior" usa o valor_unitario do medicao_item da época
 *     (não o atual contratual), preservando fidelidade do que foi medido.
 *   - "valor_global_item" usa o valor_unitario atual do detalhamento.
 *
 * Material/serviço da medição atual ficam expostos pra UI manter compat
 * com o resumo contratual.
 */

type ItemPlanilha = {
  medicao_item_id: string
  detalhamento_id: string | null
  codigo: string
  descricao: string
  unidade: string | null
  quantidade_contratada: number
  valor_unitario_contratual: number
  valor_global_item: number

  qtd_anterior: number
  valor_anterior: number
  pct_anterior: number

  qtd_atual: number
  valor_atual: number
  pct_atual: number

  qtd_total: number
  valor_total: number
  pct_total: number

  qtd_saldo: number
  valor_saldo: number
  pct_saldo: number

  material_atual: number
  servico_atual: number

  // Breakdown por pavimento (só para itens "PAV TIPO ( X AO Y PAV )")
  pavimentos_pct: Record<string, number> | null
  pavimentos_pct_anterior: Record<string, number> | null
}

export type DetalhamentoPlanilha = ItemPlanilha & {
  // já tem tudo que precisa em ItemPlanilha
}

export type TarefaPlanilha = {
  id: string
  codigo: string
  nome: string
  // agregados (somatório dos detalhamentos filhos)
  valor_global: number
  valor_anterior: number
  valor_atual: number
  valor_total: number
  valor_saldo: number
  pct_anterior: number
  pct_atual: number
  pct_total: number
  pct_saldo: number
  detalhamentos: DetalhamentoPlanilha[]
}

export type GrupoPlanilha = {
  id: string
  codigo: string
  nome: string
  // agregados (somatório das tarefas filhas)
  valor_global: number
  valor_anterior: number
  valor_atual: number
  valor_total: number
  valor_saldo: number
  pct_anterior: number
  pct_atual: number
  pct_total: number
  pct_saldo: number
  tarefas: TarefaPlanilha[]
}

type TotaisPlanilha = {
  valor_global_total: number
  valor_anterior_total: number
  valor_atual_total: number
  valor_total_medido: number
  valor_saldo_total: number
  pct_anterior_total: number
  pct_atual_total: number
  pct_total_medido: number
  pct_saldo_total: number
  material_atual_total: number
  servico_atual_total: number
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
} as const

// Ordenação hierárquica: split por '.' e compara numericamente segmento a segmento.
// Ex.: "1.10" > "1.2" (correto numérico), e "1.2" > "1.1.5" (mesmo prefixo, menos específico vem antes).
function compareCodigoHierarquico(a: string, b: string): number {
  const partsA = String(a || '').split('.').map(s => Number(s))
  const partsB = String(b || '').split('.').map(s => Number(s))
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const av = Number.isFinite(partsA[i]) ? partsA[i] : -Infinity
    const bv = Number.isFinite(partsB[i]) ? partsB[i] : -Infinity
    if (av !== bv) return av - bv
  }
  // Tudo igual em segmentos numéricos — desempata pelo string original
  return String(a || '').localeCompare(String(b || ''), 'pt-BR', { numeric: true })
}

/**
 * Calcula um ItemPlanilha a partir de um detalhamento (cru, vindo da query
 * de estrutura) + dados de "atual" (qtd e valor unitário desta medição) +
 * acumulados anteriores. Centraliza a lógica de qtd/valor/pct de cada
 * grupo de colunas (anterior/atual/total/saldo).
 *
 * Para detalhamentos NÃO medidos nesta medição, passe `qtdAtual=0` e
 * `vUnitItemAtual=valor_unitario contratual` (pra valor_atual ficar zero).
 * O `medicao_item_id` deve vir vazio nesse caso (não há linha em medicao_itens).
 */
function calcularItem(args: {
  medicaoItemId: string
  detalhamentoId: string
  codigo: string
  descricao: string
  unidade: string | null
  qtdContratada: number
  vUnitContratual: number
  matUnit: number
  servUnit: number
  qtdAtual: number
  vUnitItemAtual: number
  qtdAnterior: number
  valorAnterior: number
  pavimentosPct: Record<string, number> | null
  pavimentosPctAnterior: Record<string, number> | null
}): ItemPlanilha {
  const {
    medicaoItemId,
    detalhamentoId,
    codigo,
    descricao,
    unidade,
    qtdContratada: qtdContr,
    vUnitContratual,
    matUnit,
    servUnit,
    qtdAtual,
    vUnitItemAtual,
    qtdAnterior,
    valorAnterior,
    pavimentosPct,
    pavimentosPctAnterior,
  } = args

  const valorAtual = qtdAtual * vUnitItemAtual
  const qtdTotal = qtdAnterior + qtdAtual
  const valorTotal = valorAnterior + valorAtual

  const qtdSaldo = qtdContr - qtdTotal
  // Valor saldo: usamos o unitário contratual ATUAL (é "quanto falta
  // faturar pelo preço de hoje"). Snapshot histórico só faz sentido pra
  // medição já feita, não pra saldo a fazer.
  const valorSaldo = qtdSaldo * vUnitContratual

  const valorGlobalItem = qtdContr * vUnitContratual

  const pctAnterior = qtdContr > 0 ? (qtdAnterior / qtdContr) * 100 : 0
  const pctAtual = qtdContr > 0 ? (qtdAtual / qtdContr) * 100 : 0
  const pctTotal = qtdContr > 0 ? (qtdTotal / qtdContr) * 100 : 0
  // Saldo é por convenção não-negativo (se medido > contratado, saldo "zera")
  const pctSaldo = qtdContr > 0 ? Math.max(0, (qtdSaldo / qtdContr) * 100) : 0

  return {
    medicao_item_id: medicaoItemId,
    detalhamento_id: detalhamentoId,
    codigo,
    descricao,
    unidade,
    quantidade_contratada: qtdContr,
    valor_unitario_contratual: vUnitContratual,
    valor_global_item: valorGlobalItem,

    qtd_anterior: qtdAnterior,
    valor_anterior: valorAnterior,
    pct_anterior: pctAnterior,

    qtd_atual: qtdAtual,
    valor_atual: valorAtual,
    pct_atual: pctAtual,

    qtd_total: qtdTotal,
    valor_total: valorTotal,
    pct_total: pctTotal,

    qtd_saldo: qtdSaldo,
    valor_saldo: valorSaldo,
    pct_saldo: pctSaldo,

    material_atual: qtdAtual * matUnit,
    servico_atual: qtdAtual * servUnit,

    pavimentos_pct: pavimentosPct,
    pavimentos_pct_anterior: pavimentosPctAnterior,
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()

    // 1) Carrega medição-alvo (e valida)
    const { data: medicaoAlvo, error: medErr } = await admin
      .from('medicoes')
      .select('id, numero, status, contrato_id, data_aprovacao')
      .eq('id', medicaoId)
      .single()
    if (medErr || !medicaoAlvo) {
      return NextResponse.json(
        { error: 'Medição não encontrada', detail: medErr?.message },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }

    // Sanity: medição pertence ao contrato da rota?
    if ((medicaoAlvo as any).contrato_id !== contratoId) {
      return NextResponse.json(
        { error: 'Medição não pertence ao contrato informado' },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    // 2) Todas medições do contrato — pra distinguir "anterior" vs "atual"
    const { data: medicoesDoContrato, error: medsErr } = await admin
      .from('medicoes')
      .select('id, status, numero, data_aprovacao')
      .eq('contrato_id', contratoId)
    if (medsErr) throw medsErr

    // IDs das aprovadas anteriores: aprovado E id != medicaoId.
    // (Se a alvo já estiver aprovada ela é "atual", não "anterior".)
    const idsAprovadasAnteriores = (medicoesDoContrato || [])
      .filter((m: any) => m.status === 'aprovado' && m.id !== medicaoId)
      .map((m: any) => m.id as string)

    // 3) Itens da medição-alvo com detalhamento embed (com fallback de schema)
    let medicaoItens: any[] = []
    {
      const tryFull = await admin
        .from('medicao_itens')
        .select(`
          id, quantidade_medida, valor_unitario, detalhamento_id, pavimentos_pct,
          detalhamento:detalhamentos (
            id, codigo, descricao, unidade, quantidade_contratada,
            valor_unitario, valor_material_unit, valor_servico_unit
          )
        `)
        .eq('medicao_id', medicaoId)
      if (!tryFull.error) {
        medicaoItens = tryFull.data || []
      } else if (isSchemaMissingError(tryFull.error, ['valor_material_unit', 'valor_servico_unit'])) {
        const fallback = await admin
          .from('medicao_itens')
          .select(`
            id, quantidade_medida, valor_unitario, detalhamento_id, pavimentos_pct,
            detalhamento:detalhamentos (
              id, codigo, descricao, unidade, quantidade_contratada, valor_unitario
            )
          `)
          .eq('medicao_id', medicaoId)
        if (fallback.error) throw fallback.error
        medicaoItens = fallback.data || []
      } else {
        throw tryFull.error
      }
    }

    // 4) Acumulados anteriores — quantidade, valor e pavimentos_pct por detalhamento.
    //    Consolidado em uma única query (elimina a query duplicada anterior).
    const qtdAnteriorPorDet: Record<string, number> = {}
    const valorAnteriorPorDet: Record<string, number> = {}
    const pavPctAntPorDet: Record<string, Record<string, number>> = {}
    if (idsAprovadasAnteriores.length > 0) {
      const { data: anterioresRows, error: antErr } = await admin
        .from('medicao_itens')
        .select('detalhamento_id, quantidade_medida, valor_unitario, pavimentos_pct')
        .in('medicao_id', idsAprovadasAnteriores)
      if (antErr) throw antErr
      for (const r of (anterioresRows || []) as any[]) {
        const detId = r.detalhamento_id
        if (!detId) continue
        const q = Number(r.quantidade_medida || 0)
        const vu = Number(r.valor_unitario || 0)
        qtdAnteriorPorDet[detId] = (qtdAnteriorPorDet[detId] || 0) + q
        valorAnteriorPorDet[detId] = (valorAnteriorPorDet[detId] || 0) + q * vu
        // MAX pct por pavto — acumula maior valor entre medições aprovadas
        if (r.pavimentos_pct && typeof r.pavimentos_pct === 'object') {
          if (!pavPctAntPorDet[detId]) pavPctAntPorDet[detId] = {}
          for (const [k, v] of Object.entries(r.pavimentos_pct as Record<string, number>)) {
            const prev = Number(pavPctAntPorDet[detId][k] || 0)
            const cur = Number(v)
            if (cur > prev) pavPctAntPorDet[detId][k] = cur
          }
        }
      }
    }

    // 5) Monta linhas (FLAT — apenas itens DESTA medição)
    const itens: ItemPlanilha[] = (medicaoItens || [])
      .map((it: any): ItemPlanilha | null => {
        const det = it.detalhamento
        if (!det) {
          // Sem detalhamento (NULL ou registro órfão) — pula. Manter na planilha
          // sem código/descrição/qtd contratada não dá pra calcular saldo nem %.
          return null
        }
        const detId: string = det.id
        const qtdContr = Number(det.quantidade_contratada || 0)
        const matUnit = Number(det.valor_material_unit || 0)
        const servUnit = Number(det.valor_servico_unit || 0)
        // Valor unitário contratual atual: prefere o explícito; se ausente,
        // soma material+serviço (pra contratos que decompõem).
        const vUnitContratual = Number(det.valor_unitario || (matUnit + servUnit))

        return calcularItem({
          medicaoItemId: it.id,
          detalhamentoId: detId,
          codigo: det.codigo,
          descricao: det.descricao,
          unidade: det.unidade ?? null,
          qtdContratada: qtdContr,
          vUnitContratual,
          matUnit,
          servUnit,
          qtdAtual: Number(it.quantidade_medida || 0),
          vUnitItemAtual: Number(it.valor_unitario || 0),
          qtdAnterior: qtdAnteriorPorDet[detId] || 0,
          valorAnterior: valorAnteriorPorDet[detId] || 0,
          pavimentosPct: it.pavimentos_pct || null,
          pavimentosPctAnterior: pavPctAntPorDet[detId] || null,
        })
      })
      .filter((x): x is ItemPlanilha => x !== null)
      .sort((a, b) => compareCodigoHierarquico(a.codigo, b.codigo))

    // 5b) Mapa de "atual" por detalhamento (pra reuso na hierarquia).
    //     A medição-alvo já fornece esse snapshot; pra detalhamentos que NÃO
    //     foram medidos nesta medição, qtdAtual=0 e vUnitItemAtual=0
    //     (resultando em valor_atual=0).
    const atualPorDet: Record<string, {
      medicaoItemId: string
      qtdAtual: number
      vUnitItemAtual: number
      pavimentosPct: Record<string, number> | null
    }> = {}
    for (const it of (medicaoItens || []) as any[]) {
      const det = it.detalhamento
      if (!det) continue
      atualPorDet[det.id] = {
        medicaoItemId: it.id,
        qtdAtual: Number(it.quantidade_medida || 0),
        vUnitItemAtual: Number(it.valor_unitario || 0),
        pavimentosPct: it.pavimentos_pct || null,
      }
    }

    // 5c) Carrega estrutura completa do contrato (grupos → tarefas → detalhamentos),
    //     com fallback de schema pra valor_material_unit/valor_servico_unit.
    let estruturaRaw: any[] = []
    {
      const tryFull = await admin
        .from('grupos_macro')
        .select(`
          id, codigo, nome, ordem, valor_contratado, valor_material, valor_servico,
          tarefas (
            id, codigo, nome, ordem, valor_total, valor_material, valor_servico, grupo_macro_id,
            detalhamentos (
              id, codigo, descricao, unidade, ordem, quantidade_contratada,
              valor_unitario, valor_material_unit, valor_servico_unit, tarefa_id
            )
          )
        `)
        .eq('contrato_id', contratoId)
        .order('ordem')
      if (!tryFull.error) {
        estruturaRaw = tryFull.data || []
      } else if (
        isSchemaMissingError(tryFull.error, ['valor_material_unit', 'valor_servico_unit'])
      ) {
        const fallback = await admin
          .from('grupos_macro')
          .select(`
            id, codigo, nome, ordem, valor_contratado, valor_material, valor_servico,
            tarefas (
              id, codigo, nome, ordem, valor_total, valor_material, valor_servico, grupo_macro_id,
              detalhamentos (
                id, codigo, descricao, unidade, ordem, quantidade_contratada,
                valor_unitario, tarefa_id
              )
            )
          `)
          .eq('contrato_id', contratoId)
          .order('ordem')
        if (fallback.error) throw fallback.error
        estruturaRaw = fallback.data || []
      } else {
        throw tryFull.error
      }
    }

    // 5d) Constrói árvore hierárquica com agregados.
    //     Para CADA detalhamento (mesmo os não medidos nesta medição), monta
    //     um ItemPlanilha completo. Tarefa e grupo agregam VALORES dos filhos
    //     e calculam pcts SOBRE os agregados (não soma de pcts).
    const grupos: GrupoPlanilha[] = (estruturaRaw || []).map((g: any): GrupoPlanilha => {
      const tarefas: TarefaPlanilha[] = ((g.tarefas as any[]) || []).map((t: any): TarefaPlanilha => {
        const detalhamentos: DetalhamentoPlanilha[] = ((t.detalhamentos as any[]) || []).map(
          (d: any): DetalhamentoPlanilha => {
            const detId: string = d.id
            const qtdContr = Number(d.quantidade_contratada || 0)
            const matUnit = Number(d.valor_material_unit || 0)
            const servUnit = Number(d.valor_servico_unit || 0)
            const vUnitContratual = Number(d.valor_unitario || (matUnit + servUnit))

            const atual = atualPorDet[detId]
            return calcularItem({
              medicaoItemId: atual?.medicaoItemId || '',
              detalhamentoId: detId,
              codigo: d.codigo,
              descricao: d.descricao,
              unidade: d.unidade ?? null,
              qtdContratada: qtdContr,
              vUnitContratual,
              matUnit,
              servUnit,
              qtdAtual: atual?.qtdAtual || 0,
              vUnitItemAtual: atual?.vUnitItemAtual || 0,
              qtdAnterior: qtdAnteriorPorDet[detId] || 0,
              valorAnterior: valorAnteriorPorDet[detId] || 0,
              pavimentosPct: atual?.pavimentosPct || null,
              pavimentosPctAnterior: pavPctAntPorDet[detId] || null,
            })
          },
        )
        // Ordena detalhamentos hierarquicamente
        detalhamentos.sort((a, b) => compareCodigoHierarquico(a.codigo, b.codigo))

        // Agrega na tarefa
        const tarefaAgg = detalhamentos.reduce(
          (acc, det) => ({
            valor_global: acc.valor_global + det.valor_global_item,
            valor_anterior: acc.valor_anterior + det.valor_anterior,
            valor_atual: acc.valor_atual + det.valor_atual,
            valor_total: acc.valor_total + det.valor_total,
            valor_saldo: acc.valor_saldo + det.valor_saldo,
          }),
          { valor_global: 0, valor_anterior: 0, valor_atual: 0, valor_total: 0, valor_saldo: 0 },
        )

        const tVg = tarefaAgg.valor_global
        const tarefa: TarefaPlanilha = {
          id: t.id,
          codigo: t.codigo,
          nome: t.nome,
          valor_global: tarefaAgg.valor_global,
          valor_anterior: tarefaAgg.valor_anterior,
          valor_atual: tarefaAgg.valor_atual,
          valor_total: tarefaAgg.valor_total,
          valor_saldo: tarefaAgg.valor_saldo,
          pct_anterior: tVg > 0 ? (tarefaAgg.valor_anterior / tVg) * 100 : 0,
          pct_atual: tVg > 0 ? (tarefaAgg.valor_atual / tVg) * 100 : 0,
          pct_total: tVg > 0 ? (tarefaAgg.valor_total / tVg) * 100 : 0,
          pct_saldo: tVg > 0 ? Math.max(0, (tarefaAgg.valor_saldo / tVg) * 100) : 0,
          detalhamentos,
        }
        return tarefa
      })
      // Ordena tarefas hierarquicamente
      tarefas.sort((a, b) => compareCodigoHierarquico(a.codigo, b.codigo))

      // Agrega no grupo
      const grupoAgg = tarefas.reduce(
        (acc, t) => ({
          valor_global: acc.valor_global + t.valor_global,
          valor_anterior: acc.valor_anterior + t.valor_anterior,
          valor_atual: acc.valor_atual + t.valor_atual,
          valor_total: acc.valor_total + t.valor_total,
          valor_saldo: acc.valor_saldo + t.valor_saldo,
        }),
        { valor_global: 0, valor_anterior: 0, valor_atual: 0, valor_total: 0, valor_saldo: 0 },
      )

      const gVg = grupoAgg.valor_global
      return {
        id: g.id,
        codigo: g.codigo,
        nome: g.nome,
        valor_global: grupoAgg.valor_global,
        valor_anterior: grupoAgg.valor_anterior,
        valor_atual: grupoAgg.valor_atual,
        valor_total: grupoAgg.valor_total,
        valor_saldo: grupoAgg.valor_saldo,
        pct_anterior: gVg > 0 ? (grupoAgg.valor_anterior / gVg) * 100 : 0,
        pct_atual: gVg > 0 ? (grupoAgg.valor_atual / gVg) * 100 : 0,
        pct_total: gVg > 0 ? (grupoAgg.valor_total / gVg) * 100 : 0,
        pct_saldo: gVg > 0 ? Math.max(0, (grupoAgg.valor_saldo / gVg) * 100) : 0,
        tarefas,
      }
    })
    // Ordena grupos hierarquicamente
    grupos.sort((a, b) => compareCodigoHierarquico(a.codigo, b.codigo))

    // 6) Totais agregados
    const totais: TotaisPlanilha = itens.reduce<TotaisPlanilha>(
      (acc, l) => ({
        valor_global_total: acc.valor_global_total + l.valor_global_item,
        valor_anterior_total: acc.valor_anterior_total + l.valor_anterior,
        valor_atual_total: acc.valor_atual_total + l.valor_atual,
        valor_total_medido: acc.valor_total_medido + l.valor_total,
        valor_saldo_total: acc.valor_saldo_total + l.valor_saldo,
        // pct totais ficam zerados aqui — preenchidos depois com base nos totais
        pct_anterior_total: 0,
        pct_atual_total: 0,
        pct_total_medido: 0,
        pct_saldo_total: 0,
        material_atual_total: acc.material_atual_total + l.material_atual,
        servico_atual_total: acc.servico_atual_total + l.servico_atual,
      }),
      {
        valor_global_total: 0,
        valor_anterior_total: 0,
        valor_atual_total: 0,
        valor_total_medido: 0,
        valor_saldo_total: 0,
        pct_anterior_total: 0,
        pct_atual_total: 0,
        pct_total_medido: 0,
        pct_saldo_total: 0,
        material_atual_total: 0,
        servico_atual_total: 0,
      },
    )

    // Percentuais de totais com base nos valores agregados
    const vg = totais.valor_global_total
    if (vg > 0) {
      totais.pct_anterior_total = (totais.valor_anterior_total / vg) * 100
      totais.pct_atual_total = (totais.valor_atual_total / vg) * 100
      totais.pct_total_medido = (totais.valor_total_medido / vg) * 100
      totais.pct_saldo_total = Math.max(0, (totais.valor_saldo_total / vg) * 100)
    }

    return NextResponse.json(
      {
        medicao: {
          id: (medicaoAlvo as any).id,
          numero: (medicaoAlvo as any).numero,
          status: (medicaoAlvo as any).status,
          contrato_id: (medicaoAlvo as any).contrato_id,
        },
        itens,
        grupos,
        totais,
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch (e: any) {
    return apiError(e)
  }
}
