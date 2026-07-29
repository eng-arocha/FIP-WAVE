/**
 * Tipos compartilhados do dashboard de análise hierárquica do contrato.
 *
 * Usado pela página (app/(app)/contratos/[id]/page.tsx) e pela rota de
 * agregação (app/api/contratos/[id]/dashboard/route.ts) — mantém o
 * contrato de payload em um único lugar.
 *
 * Convenções:
 *   - "realizado" = o que JÁ foi consumido do contratado (definição depende
 *     do modo: total, material ou servico).
 *   - "saldo aprovado material" = pedidos fat-direto aprovados que ainda
 *     não viraram NF (zera quando NF é lançada).
 *   - "saldo medicao servico" = medições aprovadas que ainda não viraram
 *     NF Wave (zera quando a NF Wave é registrada — tabela
 *     notas_fiscais_wave criada na migration 059).
 *
 * Modo de exibição vs. fórmula de "realizado":
 *   total    → realizado = realizado_servico + realizado_material
 *   material → realizado = realizado_material  (NFs material lançadas)
 *   servico  → realizado = realizado_servico   (medições aprovadas)
 */

export type DashboardModo = 'total' | 'material' | 'servico'

export type DashboardNivel = 1 | 2 | 3

export interface DashboardItem {
  /** UUID do registro (grupo_macro / tarefa / detalhamento conforme nivel) */
  id: string
  codigo: string
  nome: string
  /** 1 = grupo macro, 2 = tarefa, 3 = detalhamento */
  nivel: DashboardNivel
  /** ID do nível pai (null se nível 1) */
  pai_id: string | null
  /** True se há filhos diretos (permite drill-down deeper) */
  tem_filhos: boolean

  // ---- valores contratuais (planejado) ----
  valor_contratado_total: number
  valor_contratado_material: number
  valor_contratado_servico: number

  // ---- realizado (consumido do contratado) ----
  /** Medições serviço aprovadas + NFs material lançadas (não-rejeitadas) */
  realizado_total: number
  /** NFs fat-direto material com status != 'rejeitada' */
  realizado_material: number
  /** Medições com status='aprovado' (somando valor_medido dos itens) */
  realizado_servico: number

  // ---- saldos aprovados (compromisso aprovado, ainda sem NF) ----
  /**
   * Σ(pedidos fat-direto aprovados, valor_total da solicitação) − realizado_material.
   * Zera quando todas as NFs do pedido são lançadas.
   * PODE ser negativo: valor negativo significa que as NFs lançadas superam
   * o aprovado do item (estouro). O clamp em zero foi removido porque
   * escondia exatamente o caso que precisa de atenção.
   */
  saldo_aprovado_material: number
  /**
   * realizado_servico − Σ(NFs Wave de serviço lançadas).
   * Zera quando a Wave emite NF correspondente à medição aprovada.
   * Tabela notas_fiscais_wave criada na migration 059 — vazia inicialmente,
   * então saldo_medicao_servico = realizado_servico até a UI de NF Wave existir.
   * PODE ser negativo (NF de serviço maior que o medido aprovado).
   */
  saldo_medicao_servico: number
}

export interface DashboardResponse {
  /** Itens do nível atual (filhos diretos do contexto). Já vêm ordenados por código. */
  itens: DashboardItem[]
  /**
   * Contexto de drill-down ativo. nivel=1 quando nada foi filtrado.
   * grupo_id presente = drill em nivel 2 (mostra tarefas do grupo).
   * tarefa_id presente = drill em nivel 3 (mostra detalhamentos da tarefa).
   * detalhamento_id presente = item único.
   */
  contexto: {
    nivel: DashboardNivel
    grupo_id: string | null
    tarefa_id: string | null
    detalhamento_id: string | null
  }
  /** Breadcrumb pra UI render — vazio quando nivel=1 */
  breadcrumb: Array<{ id: string; codigo: string; nome: string; nivel: DashboardNivel }>
}
