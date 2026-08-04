/**
 * Cálculo (puro) do saldo financeiro de um pedido de faturamento direto.
 *
 * Extraído da rota `/fat-direto/solicitacoes/[solId]/saldo` pra ficar
 * testável: a versão anterior filtrava as NFs por strings de status legadas
 * ('validada' / 'pendente' / 'rejeitada'), que deixaram de existir na
 * migration 065. Com isso NENHUMA NF era descontada e o saldo devolvido era o
 * valor cheio do pedido — o fluxo de encerramento de saldo exibia o pedido
 * inteiro como se fosse a sobra a devolver.
 *
 * A única fonte de verdade sobre "esse status consome saldo?" é
 * `nf-status.ts`.
 */
import { nfReservaSaldo, nfPendente } from '@/lib/db/nf-status'

export interface NfParaSaldo {
  valor: number | string | null | undefined
  status: string | null | undefined
}

export interface SaldoPedido {
  pedido_valor: number
  /** NFs aprovadas (já valem para pagamento). */
  total_nf_aprovadas: number
  /** NFs aguardando aprovação ou em correção — reservam saldo. */
  total_nf_pendentes: number
  /** Tudo que reserva saldo: aprovadas + pendentes. */
  total_nf_ativas: number
  /** O que ainda não virou NF — é ISSO que o encerramento devolve aos itens. */
  saldo_liquido: number
  pct_utilizado: number
  alerta: 'ok' | 'atencao' | 'critico' | 'esgotado'
}

export function calcularSaldoPedido(
  valorTotalPedido: number | string | null | undefined,
  nfs: NfParaSaldo[] | null | undefined,
): SaldoPedido {
  const pedido_valor = Number(valorTotalPedido || 0)
  const ativas = (nfs || []).filter(n => nfReservaSaldo(n.status))
  const soma = (lista: NfParaSaldo[]) => lista.reduce((s, n) => s + Number(n.valor || 0), 0)

  const total_nf_pendentes = soma(ativas.filter(n => nfPendente(n.status)))
  const total_nf_aprovadas = soma(ativas.filter(n => !nfPendente(n.status)))
  const total_nf_ativas = total_nf_aprovadas + total_nf_pendentes

  const saldo_liquido = pedido_valor - total_nf_ativas
  const pct_utilizado = pedido_valor > 0 ? (total_nf_ativas / pedido_valor) * 100 : 0

  let alerta: SaldoPedido['alerta'] = 'ok'
  if (pct_utilizado >= 100 || saldo_liquido <= 0.01) alerta = 'esgotado'
  else if (pct_utilizado >= 95) alerta = 'critico'
  else if (pct_utilizado >= 80) alerta = 'atencao'

  return {
    pedido_valor,
    total_nf_aprovadas,
    total_nf_pendentes,
    total_nf_ativas,
    saldo_liquido,
    pct_utilizado,
    alerta,
  }
}
