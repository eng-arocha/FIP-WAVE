/**
 * Máquina de estados (pura) do workflow de aprovação de NF de faturamento
 * direto. Módulo-folha: SEM imports — pode ser usado por fat-direto.ts e
 * por nf-workflow.ts sem criar dependência circular.
 *
 * Estados:
 *  - aguardando_aprovacao: contratada lançou; aguardando o contratante.
 *  - aprovada: contratante aprovou. Só aqui a NF "vale" (pagável/relatórios).
 *  - em_correcao: contratante rejeitou com motivo; volta pra contratada.
 *  - cancelada: NF abandonada (não conta pra saldo).
 */
export type NfStatus = 'aguardando_aprovacao' | 'aprovada' | 'em_correcao' | 'cancelada'

/**
 * Status inicial da NF no lançamento. Quem tem permissão de aprovar
 * (admin / representante do contratante) lança direto como aprovada —
 * não faz sentido aprovar a si mesmo.
 */
export function statusInicialNf(lancadorPodeAprovar: boolean): NfStatus {
  return lancadorPodeAprovar ? 'aprovada' : 'aguardando_aprovacao'
}

/** Transições permitidas do workflow. */
const TRANSICOES: Record<NfStatus, NfStatus[]> = {
  aguardando_aprovacao: ['aprovada', 'em_correcao', 'cancelada'],
  em_correcao: ['aguardando_aprovacao', 'cancelada'],
  aprovada: ['cancelada'],
  cancelada: [],
}

/** True se a transição `de → para` é válida. */
export function podeTransicionar(de: NfStatus, para: NfStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false
}

/**
 * True se uma NF nesse status consome (reserva) saldo do pedido — ou seja,
 * entra no somatório do 3-way match. Só `cancelada` (e o legado `rejeitada`)
 * não reservam. Aceita null/undefined (retorna false).
 */
export function nfReservaSaldo(status: string | null | undefined): boolean {
  return status === 'aguardando_aprovacao' || status === 'em_correcao' || status === 'aprovada'
}

/** True se a NF está pendente de decisão do contratante (não aprovada nem cancelada). */
export function nfPendente(status: string | null | undefined): boolean {
  return status === 'aguardando_aprovacao' || status === 'em_correcao'
}
