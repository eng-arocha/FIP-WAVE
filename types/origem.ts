// types/origem.ts
import type { DashboardModo } from './dashboard'

export type OrigemTipo = 'realizado' | 'saldo'

export type OrigemNotaFatDireto = {
  tipo: 'nf-fat-direto'
  id: string
  numero: string
  data: string                 // ISO YYYY-MM-DD
  valorAlocado: number         // porção alocada ao escopo
  valorTotalNf: number         // valor bruto da NF
  status: string               // 'pendente' | 'validada' | 'rejeitada' | ...
  pedidoId: string
  pedidoNumero: string
}

export type OrigemNotaWave = {
  tipo: 'nf-wave'
  id: string
  numero: string
  data: string
  valorAlocado: number
  valorTotalNf: number
  status: string
  /** Id de navegação: medição (`notas_fiscais_wave`) ou pedido (`wave_servico`). */
  medicaoId: string
  medicaoNumero: string
  /**
   * Quando a NF veio de um pedido `wave_servico` (fonte primária), o
   * drill-down abre o pedido em vez da medição.
   */
  pedidoId?: string
}

export type OrigemPedidoSaldo = {
  tipo: 'pedido-saldo'
  id: string
  numero: string
  aprovadoEm: string | null
  aprovado: number
  emNf: number
  saldo: number
}

export type OrigemMedicaoSaldo = {
  tipo: 'medicao-saldo'
  id: string
  numero: string
  aprovadoEm: string | null
  aprovado: number
  emNf: number
  saldo: number
}

export type OrigemItem =
  | OrigemNotaFatDireto
  | OrigemNotaWave
  | OrigemPedidoSaldo
  | OrigemMedicaoSaldo

export type OrigemScope = {
  id: string | null
  codigo: string
  nome: string
  nivel: 1 | 2 | 3 | null      // null = raiz (todo o contrato)
} | null

export type OrigemResumoStatus = {
  validadas?: number
  pendentes?: number
  rejeitadas?: number
}

export type OrigemResponse = {
  total: number                // soma dos valorAlocado / saldo
  count: number                // quantidade de itens retornados
  itens: OrigemItem[]
  resumoStatus?: OrigemResumoStatus
  scope: OrigemScope
  modo: DashboardModo
  origem: OrigemTipo
}
