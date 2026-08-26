/**
 * Teto de quantidade de uma medicao — a regra "nao se mede mais de 100% do
 * contratado".
 *
 * `medicao_itens.quantidade_medida` e o DELTA do periodo, nao o acumulado.
 * Logo o teto de UMA medicao nao e `quantidade_contratada`: e o que sobra do
 * contrato depois do que ja foi aprovado antes.
 *
 *     teto = quantidade_contratada − acumulado aprovado anterior
 *
 * O acumulado anterior segue o mesmo criterio da rota /planilha e de
 * /medicoes/acumulado: soma de `quantidade_medida` das medicoes APROVADAS
 * cronologicamente anteriores a esta.
 *
 * Onde isso e aplicado (todos os caminhos que gravam quantidade):
 *   - PATCH .../detalhamentos/[id]/ajustar  (ramo agregado — ajuste do admin)
 *   - POST  /api/contratos/[id]/medicoes     (lancamento, via createMedicao)
 *
 * O ramo de breakdown (`pavimentos_pct`) ja e limitado por construcao: cada
 * celula vale no maximo 100% e o numero de celulas e a propria quantidade
 * contratada — a soma nunca ultrapassa o contrato.
 */

import { arredondarQtde } from './medicao-breakdown'

/**
 * Folga para erro de ponto flutuante. A quantidade e NUMERIC(15,6) no banco,
 * entao 1e-6 e exatamente um "ulp" da coluna — abaixo disso nao ha diferenca
 * representavel.
 */
export const TOLERANCIA_TETO = 1e-6

/**
 * Maximo que esta medicao pode registrar para o item.
 *
 * Retorna `null` quando nao da pra afirmar um teto — `quantidade_contratada`
 * ausente ou <= 0, o que acontece em item mal cadastrado. Nesse caso NAO se
 * bloqueia nada: recusar por dado faltante travaria o usuario sem que ele
 * tenha como resolver pela tela.
 */
export function calcularTetoMedicao(
  quantidadeContratada: number | null | undefined,
  qtdAnterior: number | null | undefined,
): number | null {
  const qc = Number(quantidadeContratada)
  if (!Number.isFinite(qc) || qc <= 0) return null
  const ant = Math.max(0, Number(qtdAnterior) || 0)
  return Math.max(0, arredondarQtde(qc - ant))
}

/** True se `qtdNova` estoura o teto (com folga de ponto flutuante). */
export function excedeTeto(qtdNova: number, teto: number | null): boolean {
  if (teto === null) return false
  const q = Number(qtdNova)
  if (!Number.isFinite(q)) return false
  return q - teto > TOLERANCIA_TETO
}

/** Formata quantidade pra mensagem, sem zeros a direita inuteis. */
export function fmtQtdTeto(n: number): string {
  const v = arredondarQtde(n)
  return Number.isInteger(v)
    ? String(v)
    : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

/**
 * Mensagem de erro que explica a conta inteira — teto, quanto ja foi aprovado
 * e a que percentual do contrato o pedido levaria. Sem isso o usuario recebe
 * "quantidade invalida" e nao tem como descobrir qual e o maximo.
 */
export function mensagemExcedeTeto(args: {
  codigo?: string | null
  unidade?: string | null
  quantidadeContratada: number
  qtdAnterior: number
  qtdNova: number
  teto: number
}): string {
  const un = args.unidade ? ` ${args.unidade}` : ''
  const item = args.codigo ? `O item ${args.codigo}` : 'Este item'
  const acumFinal = arredondarQtde(args.qtdAnterior + args.qtdNova)
  const pctFinal = args.quantidadeContratada > 0
    ? (acumFinal / args.quantidadeContratada) * 100
    : 0
  const anterior = args.qtdAnterior > 0
    ? ` e ${fmtQtdTeto(args.qtdAnterior)}${un} já aprovada(s) em medições anteriores`
    : ''
  return (
    `${item} tem ${fmtQtdTeto(args.quantidadeContratada)}${un} contratada(s)${anterior} — ` +
    `o máximo desta medição é ${fmtQtdTeto(args.teto)}${un} (100% do contrato). ` +
    `A quantidade informada (${fmtQtdTeto(args.qtdNova)}${un}) levaria o acumulado a ` +
    `${fmtQtdTeto(acumFinal)}${un}, ou ${pctFinal.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do contratado.`
  )
}
