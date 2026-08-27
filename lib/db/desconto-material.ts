/**
 * Camadas ① e ③ da regra de medição — ver `lib/informakon/ajuste-por-lastro.ts`
 * para a camada ②, que é a que decide o percentual.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ① A MEDIÇÃO, POR ITEM
 *
 *     desconto ideal = material acumulado do item − desconto já lançado
 *
 * Sem teto pela nota que temos cadastrada e sem compensação entre itens. Num
 * mês em que nada foi cortado antes, isso é exatamente `p × M` — a mesma conta
 * da coluna L da Folha de Rosto.
 *
 * A base é ACUMULADA por um motivo só, e ele é decisivo: quando um corte por
 * falta de lastro deixa material pendente, a nota entra no Informakon meses
 * depois, e nesse mês o item pode não ter evolução física nenhuma. Com base no
 * período o desconto sairia zero, o lastro ficaria parado no ERP e o item
 * congelaria abaixo do físico para sempre — e sem liberação não há de onde
 * deduzir o faturamento direto.
 *
 * Isto não é a régua acumulada que foi removida: aquela liberava percentual
 * contra material que ninguém tinha comprovado. O que limita este ideal é a
 * camada ②, e ela olha o LASTRO REAL do Informakon por macro grupo, não a
 * nossa nota. Nota nossa que ainda não foi lançada lá não desconta nada; nota
 * lançada lá que nós não temos cadastrada desconta. Quem manda no desconto é
 * o ERP, porque é ele que executa o abatimento.
 *
 * O invariante vale por construção, na base acumulada:
 *
 *     desconto acumulado = jaLancado + ideal ≤ jaLancado + pendente = matAcum
 *     ⇒ (p_acum × MO + desconto acumulado) / G ≤ p_acum
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ③ A NOTA DA FIP, POR ITEM
 *
 *     cobertura no site = NF de terceiro lançada + saldo de pedido aprovado
 *
 *     cobertura ≥ p × M   →  a FIP NÃO emite. O material já está comprado; o
 *                            que falta é lançar a nota no Informakon.
 *     cobertura <  p × M  →  a FIP emite a diferença.
 *
 * Esta camada NÃO mexe no percentual. Ela responde outra pergunta: alguém
 * precisa emitir nota, ou é só atraso de lançamento? Sem ela, o sistema pediria
 * à FIP para faturar material que o fornecedor já faturou — na Medição 5 seriam
 * R$ 50.291,03 no grupo 1, que tem R$ 73.057,03 de pedido aprovado esperando a
 * nota chegar.
 *
 * E a nota que a FIP emitir não muda o percentual do mês corrente: ela vira
 * lastro quando for lançada no ERP, e a camada ② a enxerga na medição seguinte.
 */

const norm = (v: unknown) => Math.max(0, Number(v) || 0)

/** Camada ①: o desconto ideal do item é o material ainda não lançado. */
export function descontoIdealDoItem(materialADescontar: number): number {
  return norm(materialADescontar)
}

/**
 * O material do item que ainda não virou desconto lançado.
 *
 * `matAcumulado` inclui o período corrente; `jaLancado` é a soma de
 * `medicao_itens.nf_material_descontada` das medições APROVADAS anteriores —
 * só das aprovadas, senão duas medições abertas ao mesmo tempo consomem o
 * mesmo pendente e o desconto sai em dobro.
 *
 * Nunca negativo: se as aprovadas lançaram mais do que o material acumulado
 * de hoje (um ajuste de quantidade para baixo, por exemplo), o item não deve
 * nada — mas também não devolve.
 */
export function descontoPendenteDeLastro(matAcumulado: number, jaLancado: number): number {
  return Math.max(0, norm(matAcumulado) - norm(jaLancado))
}

export interface ItemCoberturaSite {
  detalhamentoId: string
  /** `p × M` — o material medido no período. */
  matMedido: number
  /** NF de terceiro já lançada NO SITE, alocada a este detalhamento. */
  nfTerceiro: number
  /** Pedido de fat-direto APROVADO alocado a este detalhamento. */
  pedidoAprovado: number
  /**
   * Quanto desta cobertura JÁ foi consumido por medições aprovadas anteriores
   * (`medicao_itens.nf_material_descontada`).
   *
   * Sem isto a conta compara estoque com fluxo: `nfTerceiro` e `pedidoAprovado`
   * são acumulados de contrato inteiro, e `matMedido` é só o período. Um item
   * cujo material já foi todo coberto em medições passadas continuaria
   * parecendo coberto ao medir material NOVO, e a FIP nunca seria chamada a
   * emitir — nem o portão de aprovação que exige essa nota seria acionado.
   */
  jaConsumido?: number
}

export interface CoberturaDoItem {
  /** NF lançada + saldo de pedido aprovado. O material que já está comprado. */
  cobertura: number
  /** Parte do material medido que tem pedido aprovado esperando a nota chegar. */
  notaACaminho: number
  /** `max(0, p × M − cobertura)`: o que a FIP precisa emitir. */
  fipPrecisaEmitir: number
}

/**
 * Camada ③. Classifica o material medido de cada item entre o que já está
 * comprado e o que exige nota nova da FIP.
 *
 * Por item, sem compensação: pedido aprovado de um item não cobre o material do
 * vizinho. `cobertura = max(NF, aprovado)` porque o pedido aprovado já contém o
 * que dele virou nota — somar os dois contaria a mesma compra duas vezes.
 */
export function classificarCoberturaDoSite(
  itens: ItemCoberturaSite[],
): Map<string, CoberturaDoItem> {
  const out = new Map<string, CoberturaDoItem>()
  for (const it of itens) {
    const matMedido = norm(it.matMedido)
    const nf = norm(it.nfTerceiro)
    const aprovado = norm(it.pedidoAprovado)
    // `max` e não soma: o pedido aprovado já contém o que dele virou nota.
    // Menos o que medições anteriores já consumiram, senão é estoque contra
    // fluxo — ver `jaConsumido`.
    const cobertura = Math.max(0, Math.max(nf, aprovado) - norm(it.jaConsumido))
    out.set(it.detalhamentoId, {
      cobertura,
      notaACaminho: Math.min(matMedido, Math.max(0, Math.min(aprovado - nf, cobertura))),
      fipPrecisaEmitir: Math.max(0, matMedido - cobertura),
    })
  }
  return out
}
