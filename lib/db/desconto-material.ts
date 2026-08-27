/**
 * Quanto a nota de material abate de cada item da medição.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REGRA, INTEIRA
 *
 *     desconto do item = MIN( material medido acumulado , nota alocada )
 *                        − o que já foi abatido em medições anteriores
 *
 * e é só isso. Cada item se resolve sozinho: nenhuma nota de um item cobre o
 * material de outro, nem dentro do mesmo macro grupo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO HÁ MAIS COMPENSAÇÃO ENTRE ITENS
 *
 * Houve uma versão com balde por macro grupo e transbordo (water-filling): a
 * nota alocada a um item cobria o material medido do vizinho, porque a FIP
 * compra por lote e a Wave mede por pavimento. Isso reduzia a nota que a FIP
 * precisava emitir.
 *
 * A decisão foi tirar, pelo caminho mais conservador. Sem compensação, o item
 * sem nota própria desconta menos, o percentual dele cai e o Informakon libera
 * menos — nunca mais. E nada se perde: a nota do vizinho continua em saldo e
 * será usada quando aquele item for medido; se não houver saldo no site, a
 * regra da nota complementar da FIP cobre a diferença.
 *
 * O custo, medido no grupo 18 desta obra: R$ 11.057 que a FIP passa a emitir
 * em material que o fornecedor já faturou. Foi aceito em troca de um boletim
 * em que cada linha se explica sozinha.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O TETO É O MATERIAL MEDIDO — nunca o contratado
 *
 * É o que garante o invariante do boletim:
 *
 *     Σ a lançar  =  Σ serviço + Σ desconto
 *                 ≤  Σ serviço + Σ material medido
 *                 =  valor medido acumulado
 *
 * ou seja, `% lançado acumulado ≤ % físico acumulado`. Descontar material que
 * ainda não foi executado obrigaria a lançar percentual que ainda não foi
 * executado — adiantar medição.
 *
 * O percentual de um PERÍODO ainda pode superar o físico do período: é a
 * devolução do que ficou retido quando a nota ainda não existia. Sai em
 * `recuperacao` para poder aparecer na tela como o que é.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ACUMULADO E NÃO O PERÍODO
 *
 * Apurar mês a mês não recupera o que ficou para trás: uma nota que chegou
 * depois do material ser medido nunca descontaria. O saldo corrido da
 * migration 074 (`medicao_itens.nf_material_descontada`) guarda o abatido, e a
 * diferença contra o acumulado é o desconto do período.
 */

export interface ItemDesconto {
  detalhamentoId: string
  /** Material medido nesta medição. Zero para detalhamentos não medidos. */
  matMedido: number
  /**
   * Material medido ACUMULADO (medições aprovadas + esta). É o teto.
   * Nunca menor que `matMedido` — se vier zerado por dado inconsistente, o
   * cálculo cai para `matMedido` e a apuração vira a do período.
   */
  matAcumulado: number
  /** NF total alocada a este detalhamento (rateio pro-rata dos pedidos). */
  nfAlocada: number
  /** Quanto desta alocação já foi abatido em medições aprovadas anteriores. */
  nfJaAbatida: number
}

export interface ResultadoDesconto {
  /**
   * Parte do total que excede o material medido NO PERÍODO — nota de meses
   * anteriores que não descontou na época e está sendo recuperada agora.
   * Já está dentro de `total`; é só para exibição.
   */
  recuperacao: number
  /** O valor que abate o material medido deste item. */
  total: number
}

const norm = (v: unknown) => Math.max(0, Number(v) || 0)

export function calcularDescontoDeMaterial(
  itens: ItemDesconto[],
): Map<string, ResultadoDesconto> {
  const resultado = new Map<string, ResultadoDesconto>()

  for (const it of itens) {
    const matMedido = norm(it.matMedido)

    // Item não medido no período não recebe desconto: gravar abatimento num
    // item que não foi medido quebraria o saldo corrido da migration 074.
    if (matMedido <= 0) {
      resultado.set(it.detalhamentoId, { recuperacao: 0, total: 0 })
      continue
    }

    // O teto nunca fica abaixo do que se está medindo agora: dado
    // inconsistente não pode impedir o desconto do próprio período.
    const teto = Math.max(norm(it.matAcumulado), matMedido)
    const acumulado = Math.min(teto, norm(it.nfAlocada))
    const total = Math.max(0, acumulado - norm(it.nfJaAbatida))

    resultado.set(it.detalhamentoId, {
      recuperacao: Math.max(0, total - matMedido),
      total,
    })
  }

  return resultado
}

/** Um item para a classificação do gap entre "pedido a caminho" e "FIP emite". */
export interface ItemSaldoAprovado {
  detalhamentoId: string
  /** Material medido que a NF não cobriu — o que precisa ser classificado. */
  gapMaterial: number
  /** Valor de pedido de fat. direto APROVADO alocado a este detalhamento. */
  aprovado: number
  /** NF já emitida contra esses pedidos, alocada a este detalhamento. */
  nfAlocada: number
}

/**
 * Classifica o gap de material do item entre "pedido aprovado, nota a caminho"
 * e "a FIP precisa emitir".
 *
 * É a ressalva da regra: o material medido que a nota não cobriu ainda pode
 * ter pedido aprovado esperando a nota do fornecedor — e nesse caso não se
 * pede nota nova à FIP, espera-se. Só o que não tem nem nota nem pedido é que
 * vira tarefa para a FIP.
 *
 * Por item, como o desconto: pedido aprovado de um item não cobre o gap do
 * vizinho. É classificação de exibição, não saldo corrido — nada aqui é
 * gravado, e o classificado nunca passa do gap do próprio período.
 */
export function calcularSaldoAprovadoPorItem(
  itens: ItemSaldoAprovado[],
): Map<string, number> {
  const resultado = new Map<string, number>()
  for (const it of itens) {
    const pool = Math.max(0, norm(it.aprovado) - norm(it.nfAlocada))
    resultado.set(it.detalhamentoId, Math.min(norm(it.gapMaterial), pool))
  }
  return resultado
}
