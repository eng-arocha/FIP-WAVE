/**
 * Base contratual de um detalhamento (item nível 3) por NATUREZA do pedido.
 *
 * Contexto do bug que originou este módulo:
 *   O controle "Saldo por item do orçamento" (Fila de Aprovações) comparava
 *   TODO o consumo de FAT direto contra `subtotal_material`. Pedidos de
 *   SERVIÇO (tipo `wave_servico`, fornecedor WAVE INSTALACOES SPE LTDA)
 *   consumiam a base de material e faziam o item aparecer como "esgotado"
 *   com saldo negativo — o que, além de errado, não deveria ser possível.
 *
 * Regra:
 *   - `wave_servico`                        → consome `subtotal_mo`
 *   - `material_fornecedor` / `fip_material`→ consome `subtotal_material`
 *
 * Colunas GENERATED (migration 040_material_mo_local.sql):
 *   subtotal_material = qtde × valor_material_unit
 *   subtotal_mo       = qtde × valor_servico_unit
 * `valor_total` (migration 001) = qtde × valor_unitario (global, mat + MO).
 *
 * Fallback conservador: contratos antigos podem não ter a quebra
 * material/MO preenchida (ambos os subtotais zerados) ou ter só um dos
 * lados. Nesses casos usamos `valor_total` como base única, para não
 * bloquear/alarmar indevidamente um pedido legítimo.
 */

export type NaturezaPedido = 'material' | 'servico'

/** Valores possíveis de `solicitacoes_fat_direto.tipo` (migration 074). */
export type TipoSolicitacao = 'material_fornecedor' | 'fip_material' | 'wave_servico'

/**
 * CNPJ da Wave — os pedidos de NF de SERVIÇO criados na autorização da
 * medição ficam na mesma tabela dos pedidos de material. A coluna `tipo`
 * existe a partir da migration 074; o CNPJ e a razão social seguem como
 * rede de segurança pra base antiga (e pra janela de schema cache stale).
 */
const CNPJ_WAVE_SERVICO = '65.528.046/0001-23'

export interface SolicitacaoClassificavel {
  tipo?: string | null
  fornecedor_cnpj?: string | null
  fornecedor_razao_social?: string | null
}

/** Fonte única da verdade: o pedido é a NF de serviço da Wave? */
export function ehPedidoDeServicoWave(sol: SolicitacaoClassificavel): boolean {
  if (sol.tipo === 'wave_servico') return true
  if (sol.fornecedor_cnpj === CNPJ_WAVE_SERVICO) return true
  return /^WAVE INSTALACOES SPE/i.test((sol.fornecedor_razao_social ?? '').trim())
}

/** Traduz o pedido na natureza do saldo contratual que ele consome. */
export function naturezaDoPedido(sol: SolicitacaoClassificavel): NaturezaPedido {
  return ehPedidoDeServicoWave(sol) ? 'servico' : 'material'
}

export interface BasesDetalhamento {
  /** subtotal_material (qtde × valor_material_unit) */
  material: number
  /** subtotal_mo (qtde × valor_servico_unit) */
  servico: number
  /** valor_total (qtde × valor_unitario global) ou material + servico */
  total: number
  /**
   * true quando o detalhamento não tem quebra material/MO utilizável.
   * Nesse caso material e serviço dividem a mesma base (`total`).
   */
  semQuebra: boolean
}

interface DetalhamentoLike {
  quantidade_contratada?: number | string | null
  valor_material_unit?: number | string | null
  valor_servico_unit?: number | string | null
  valor_unitario?: number | string | null
  subtotal_material?: number | string | null
  subtotal_mo?: number | string | null
  valor_total?: number | string | null
}

function num(v: unknown): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

/** Extrai as bases contratuais (material / serviço / total) de um detalhamento. */
export function basesDoDetalhamento(det: DetalhamentoLike): BasesDetalhamento {
  const qtd = num(det.quantidade_contratada)
  const material = num(det.subtotal_material) || qtd * num(det.valor_material_unit)
  const servico = num(det.subtotal_mo) || qtd * num(det.valor_servico_unit)
  const total = num(det.valor_total) || qtd * num(det.valor_unitario) || material + servico

  return {
    material,
    servico,
    total,
    semQuebra: material <= 0 && servico <= 0,
  }
}

/**
 * Base contratual aplicável a um pedido de determinada natureza.
 *
 * Sem quebra material/MO → base única (`total`).
 * Com quebra mas o lado da natureza zerado (ex.: item 100% material
 * recebendo um pedido de serviço) → cai pra `total`, que é o teto real do
 * item. Bloquear em 0 geraria falso "esgotado".
 */
export function baseParaNatureza(bases: BasesDetalhamento, natureza: NaturezaPedido): number {
  if (bases.semQuebra) return bases.total
  const base = natureza === 'servico' ? bases.servico : bases.material
  return base > 0 ? base : bases.total
}

export type NivelAlerta = 'ok' | 'atencao' | 'critico' | 'esgotado'

/** Semáforo padrão do consumo de um item: >=100% esgotado, >=95% crítico, >=80% atenção. */
export function nivelAlerta(consumido: number, base: number): NivelAlerta {
  if (base <= 0) return 'ok'
  const pct = (consumido / base) * 100
  if (pct >= 100 || base - consumido <= 0.01) return 'esgotado'
  if (pct >= 95) return 'critico'
  if (pct >= 80) return 'atencao'
  return 'ok'
}

const SEVERIDADE: Record<NivelAlerta, number> = { ok: 0, atencao: 1, critico: 2, esgotado: 3 }

/** Pior alerta entre vários (usado quando material e serviço têm níveis distintos). */
export function piorAlerta(...niveis: NivelAlerta[]): NivelAlerta {
  return niveis.reduce((pior, n) => (SEVERIDADE[n] > SEVERIDADE[pior] ? n : pior), 'ok' as NivelAlerta)
}
