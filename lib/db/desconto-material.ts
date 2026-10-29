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
 * ③ A NOTA DA FIP, ITEM A ITEM (decisão do usuário, 29/10/2026)
 *
 *     comprado do item  = max(NF de terceiro lançada, pedido aprovado)
 *     FIP do item       = max(0, material medido ACUMULADO − comprado)
 *
 * Esta camada NÃO mexe no percentual. Ela responde outra pergunta: alguém
 * precisa emitir nota, ou é só atraso de lançamento? Pedido aprovado sem
 * nota (inclusive o da FIP já autorizado) é "nota a caminho", não emissão.
 *
 * A base é o material INSTALADO, não o que ainda falta descontar. A versão
 * anterior perguntava só sobre o pendente de desconto e compensava NF dos
 * vizinhos do macro item: material que a Wave já teve descontado contra nota
 * de outro item sumia da conta — R$ 189.106,79 em 31 itens sem NF de ninguém
 * na análise de 29/10/2026 (relatório Material sem NF), e a FIP nunca era
 * chamada. Sobra de NF no vizinho não abate: ela só cobre o item se for
 * rateio errado do pedido, e isso é conferência de obra, não conta.
 *
 * Por construção a FIP nunca estoura o contrato: pedido + FIP ≤ medido ≤
 * contratado (MED-007: o 1.3.1 recebeu R$ 153 mil da FIP pela regra do
 * balde e passou do contratado).
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
  /**
   * Material medido ACUMULADO do item: medições aprovadas mais o período da
   * medição aberta. Inclui o que já foi descontado — o desconto pode ter
   * usado nota de outro item.
   */
  matMedido: number
  /** NF de terceiro já lançada NO SITE, alocada a este detalhamento. */
  nfTerceiro: number
  /**
   * Pedido de fat-direto APROVADO alocado a este detalhamento, inclusive o
   * pedido da FIP ainda sem nota — esse já foi autorizado e não volta como
   * emissão nova.
   */
  pedidoAprovado: number
  /**
   * Compensação de lastro registrada NESTE item (migration 085): nota de
   * outro macro item parada aqui, que paga material deste item. Sem somá-la,
   * ao medir esse material o site pediria à FIP uma segunda nota. Ver
   * lib/informakon/compensacao-lastro.ts.
   */
  coberturaExtra?: number
}

export interface CoberturaDoItem {
  /** max(NF, pedido aprovado) + compensação. O material que já está comprado. */
  cobertura: number
  /** Parte do material medido que tem pedido aprovado esperando a nota chegar. */
  notaACaminho: number
  /** `max(0, medido acumulado − cobertura)`: o que a FIP precisa emitir. */
  fipPrecisaEmitir: number
}

/**
 * Camada ③. Classifica o material medido de cada item entre o que já está
 * comprado e o que exige nota nova da FIP.
 *
 * Por item, sem compensação: NF ou pedido de um item não cobre o material do
 * vizinho, nem no mesmo macro item. `max(NF, aprovado)` e não soma porque o
 * pedido aprovado já contém o que dele virou nota.
 */
export function classificarCoberturaDoSite(
  itens: ItemCoberturaSite[],
): Map<string, CoberturaDoItem> {
  const out = new Map<string, CoberturaDoItem>()
  for (const it of itens) {
    const medido = norm(it.matMedido)
    const nf = norm(it.nfTerceiro)
    const aprovado = norm(it.pedidoAprovado)
    const cobertura = Math.max(nf, aprovado) + norm(it.coberturaExtra)
    out.set(it.detalhamentoId, {
      cobertura,
      // O medido além da nota que um pedido aprovado ainda vai trazer.
      notaACaminho: Math.min(Math.max(0, medido - nf), Math.max(0, aprovado - nf)),
      fipPrecisaEmitir: Math.max(0, medido - cobertura),
    })
  }
  return out
}
