// Conciliação da medição contra o relatório do Informakon (migration 075).
//
// Contexto que motivou (ver AGENTS/PR): a medição de serviço da Wave desconta
// o material já faturado direto pelos fornecedores. O Informakon (ERP da FIP)
// calcula esse desconto por fora, em planilha própria. Em julho/2026 os dois
// divergiram R$ 11.541,44 — e só foi descoberto DEPOIS da NF de serviço já
// emitida. Este módulo compara os dois lados ANTES da aprovação, pra avisar
// na tela da medição.
//
// Fica deliberadamente separado de `lib/db/informakon-conciliacao.ts` (que
// concilia NF de material por grupo, usado na tela /informakon) — aqui a
// unidade de comparação é a MEDIÇÃO inteira (aba "medições serviço" do
// relatório), não o grupo macro.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSchemaMissingError } from '@/lib/db/resilient'

/** Tolerância de arredondamento — abaixo disso não é divergência real. */
const TOLERANCIA = 0.01

export interface CamposConciliacaoMedicao {
  contratual: number
  material: number
  retencao: number
  aPagar: number
}

export interface DivergenciaConciliacaoMedicao {
  /** Chave estável do campo — mesma chave de CamposConciliacaoMedicao. */
  campo: string
  /** Rótulo em português pra exibir na UI. */
  rotulo: string
  informakon: number
  sistema: number
  diferenca: number
}

export interface ConciliacaoMedicao {
  /** false quando não há importação do Informakon (ou não há linha pra esta medição) */
  temDados: boolean
  /** Data do relatório importado (informakon_importacoes.referencia) */
  referencia: string | null
  informakon: CamposConciliacaoMedicao | null
  sistema: CamposConciliacaoMedicao
  divergencias: DivergenciaConciliacaoMedicao[]
  /** Maior |diferença| entre os campos comparados — usada pra decidir a cor do alerta. */
  maiorDivergencia: number
}

const CAMPOS_ZERO: CamposConciliacaoMedicao = { contratual: 0, material: 0, retencao: 0, aPagar: 0 }

/** Rótulos em português — únicos campos que este módulo compara. */
const ROTULOS: Record<keyof CamposConciliacaoMedicao, string> = {
  contratual: 'Valor contratual medido',
  material: 'Material descontado',
  retencao: 'Retenção',
  aPagar: 'Valor a pagar',
}

function semDados(sistema: CamposConciliacaoMedicao = { ...CAMPOS_ZERO }): ConciliacaoMedicao {
  return {
    temDados: false,
    referencia: null,
    informakon: null,
    sistema,
    divergencias: [],
    maiorDivergencia: 0,
  }
}

/**
 * Dados básicos da medição. `ajuste_material_anterior` é da migration 074 —
 * pode ainda não existir no banco do usuário, aí tratamos como 0 (o desconto
 * do Informakon segue sendo comparável, só sem esse ajuste extra).
 */
async function carregarMedicaoBasico(
  admin: SupabaseClient,
  medicaoId: string,
): Promise<{
  numero: number
  ajusteMaterialAnterior: number
  congelado: { material: number; total: number } | null
} | null> {
  // `material > 0` exclui as medições aprovadas antes de a coluna existir,
  // onde ela ficou gravada como 0 (não null) — ali não há snapshot a
  // respeitar e o recálculo ao vivo segue valendo.
  const snapshotDe = (d: any) => {
    if (d?.status !== 'aprovado') return null
    const material = Number(d.valor_material_correspondente ?? NaN)
    const total = Number(d.valor_total ?? NaN)
    if (!Number.isFinite(material) || !Number.isFinite(total) || material <= 0) return null
    return { material, total }
  }

  const full = await admin
    .from('medicoes')
    .select('numero, status, valor_total, valor_material_correspondente, ajuste_material_anterior')
    .eq('id', medicaoId)
    .single()

  if (!full.error && full.data) {
    const d = full.data as any
    return {
      numero: Number(d.numero),
      ajusteMaterialAnterior: Number(d.ajuste_material_anterior || 0),
      congelado: snapshotDe(d),
    }
  }

  if (full.error && isSchemaMissingError(full.error, ['ajuste_material_anterior'])) {
    const fallback = await admin
      .from('medicoes')
      .select('numero, status, valor_total, valor_material_correspondente')
      .eq('id', medicaoId)
      .single()
    if (fallback.error || !fallback.data) return null
    return {
      numero: Number((fallback.data as any).numero),
      ajusteMaterialAnterior: 0,
      congelado: snapshotDe(fallback.data),
    }
  }

  // Erro inesperado (id inválido, etc.) — não é o papel desta função denunciar
  // isso; a página principal já falharia em outro lugar. Aqui só não há dados.
  return null
}

/**
 * Percentual de retenção do contrato. Default 5% quando a coluna não existe
 * ou a consulta falha por qualquer motivo — mesmo fallback usado no resto do
 * boletim (ver `lib/db/informacon-data.ts`).
 */
async function carregarPercentualRetencao(admin: SupabaseClient, contratoId: string): Promise<number> {
  const { data, error } = await admin
    .from('contratos')
    .select('percentual_retencao')
    .eq('id', contratoId)
    .single()
  if (error || !data) return 5
  return Number((data as any).percentual_retencao ?? 5)
}

/**
 * Lado do sistema (FIP-WAVE): material medido, serviço medido, retenção e
 * valor a pagar calculados a partir dos itens da medição.
 */
async function calcularLadoSistema(
  admin: SupabaseClient,
  medicaoId: string,
  ajusteMaterialAnterior: number,
  percentualRetencao: number,
  congelado: { material: number; total: number } | null,
): Promise<CamposConciliacaoMedicao> {
  let material = 0
  let servico = 0

  // Medição aprovada com snapshot: vale o que foi congelado na aprovação.
  // Esta tela existe pra DETECTAR divergência contra o ERP da FIP — se ela
  // recalculasse ao vivo, editar o preço unitário de um detalhamento meses
  // depois inventaria uma divergência que não existe (ou esconderia uma que
  // existe). Mesma trava de lib/db/informacon-data.ts.
  if (congelado) {
    material = congelado.material
    servico = Math.max(0, congelado.total - congelado.material)
  } else {
    const { data, error } = await admin
      .from('medicao_itens')
      .select('quantidade_medida, detalhamento:detalhamentos ( valor_material_unit, valor_servico_unit )')
      .eq('medicao_id', medicaoId)

    if (error) return { ...CAMPOS_ZERO }

    for (const it of (data || []) as any[]) {
      const qtd = Number(it.quantidade_medida || 0)
      const det = it.detalhamento
      material += qtd * Number(det?.valor_material_unit || 0)
      servico += qtd * Number(det?.valor_servico_unit || 0)
    }
  }

  const contratual = material + servico
  const retencao = contratual * (percentualRetencao / 100)
  const aPagar = servico - retencao - ajusteMaterialAnterior

  return { contratual, material, retencao, aPagar }
}

/** Importação mais recente do Informakon pra este contrato, ou null se não houver nenhuma. */
async function buscarImportacaoMaisRecente(
  admin: SupabaseClient,
  contratoId: string,
): Promise<{ id: string; referencia: string } | null> {
  const { data, error } = await admin
    .from('informakon_importacoes')
    .select('id, referencia')
    .eq('contrato_id', contratoId)
    .order('referencia', { ascending: false })
    .order('importado_em', { ascending: false })
    .limit(1)

  if (error) return null // tabela ausente (schema pendente) ou qualquer outro erro: sem dados, sem estourar
  const row = ((data || []) as any[])[0]
  return row ? { id: row.id, referencia: row.referencia } : null
}

/** Linha da aba "medições serviço" do Informakon pra esta medição, ou null se não houver. */
async function buscarLinhaInformakon(
  admin: SupabaseClient,
  importacaoId: string,
  medicaoNumero: number,
): Promise<CamposConciliacaoMedicao | null> {
  const { data, error } = await admin
    .from('informakon_medicoes_servico')
    .select('valor_contratual, valor_material, retencao, valor_a_pagar')
    .eq('importacao_id', importacaoId)
    .eq('medicao_numero', medicaoNumero)
    .limit(1)

  if (error) return null
  const row = ((data || []) as any[])[0]
  if (!row) return null

  return {
    contratual: Number(row.valor_contratual || 0),
    material: Number(row.valor_material || 0),
    retencao: Number(row.retencao || 0),
    aPagar: Number(row.valor_a_pagar || 0),
  }
}

/**
 * Concilia a medição do FIP-WAVE contra o relatório do Informakon já
 * importado (migration 075). Nunca lança — qualquer ausência de tabela/coluna
 * ou erro inesperado vira `temDados: false`, porque este é um painel
 * informativo a mais na tela da medição, e ela não pode quebrar por causa
 * disso (contratos que nunca importaram um relatório do Informakon são a
 * maioria, e devem seguir vendo a tela normalmente).
 */
export async function conciliarMedicaoComInformakon(
  admin: SupabaseClient,
  contratoId: string,
  medicaoId: string,
): Promise<ConciliacaoMedicao> {
  try {
    const medicaoBasico = await carregarMedicaoBasico(admin, medicaoId)
    if (!medicaoBasico) return semDados()

    const percentualRetencao = await carregarPercentualRetencao(admin, contratoId)
    const sistema = await calcularLadoSistema(
      admin,
      medicaoId,
      medicaoBasico.ajusteMaterialAnterior,
      percentualRetencao,
      medicaoBasico.congelado,
    )

    const importacao = await buscarImportacaoMaisRecente(admin, contratoId)
    if (!importacao) return semDados(sistema)

    const informakon = await buscarLinhaInformakon(admin, importacao.id, medicaoBasico.numero)
    if (!informakon) return semDados(sistema)

    const divergencias: DivergenciaConciliacaoMedicao[] = []
    for (const campo of Object.keys(ROTULOS) as (keyof CamposConciliacaoMedicao)[]) {
      const valorInformakon = informakon[campo]
      const valorSistema = sistema[campo]
      const diferenca = valorInformakon - valorSistema
      if (Math.abs(diferenca) > TOLERANCIA) {
        divergencias.push({
          campo,
          rotulo: ROTULOS[campo],
          informakon: valorInformakon,
          sistema: valorSistema,
          diferenca,
        })
      }
    }

    const maiorDivergencia = divergencias.reduce((max, d) => Math.max(max, Math.abs(d.diferenca)), 0)

    return {
      temDados: true,
      referencia: importacao.referencia,
      informakon,
      sistema,
      divergencias,
      maiorDivergencia,
    }
  } catch {
    // Defesa final: nenhum erro inesperado (rede, timeout, etc.) pode
    // derrubar a tela da medição por causa deste painel informativo.
    return semDados()
  }
}
