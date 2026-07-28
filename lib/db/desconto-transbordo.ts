/**
 * Desconto de NF de material apurado por grupo macro.
 *
 * O PORQUÊ (não apague este comentário sem ler):
 *
 * A FIP compra material por lote — um pedido de tubo de sprinkler cobre a
 * prumada inteira. A Wave mede por pavimento. Quando a NF é amarrada ao
 * detalhamento "PRUMADA VERTICAL" e a medição acontece em "SUBSOLO 1", o
 * desconto item-a-item não encontra a nota: sobra saldo num detalhamento e
 * falta no vizinho, no mesmo grupo, do mesmo fornecedor, do mesmo pedido.
 *
 * Foi o que aconteceu na medição 004/2026: R$ 56.178,26 de material medido
 * apareceram como "sem NF" enquanto R$ 1,5 milhão de nota estava parada em
 * detalhamentos ainda não medidos do mesmo grupo. O ERP da FIP (Informakon)
 * não tinha esse problema porque desconta por macro item — um balde só.
 *
 * A regra aqui alinha as duas réguas: a nota continua alocada ao seu
 * detalhamento (o rastreio por item não se perde), mas o saldo é apurado no
 * nível do GRUPO MACRO. Fora do grupo nada transborda — Hidráulica não paga
 * material de Elétrica.
 *
 * POR QUE O SALDO É SOMADO ANTES DE SER CLAMPADO EM ZERO:
 *
 * O saldo corrido da migration 074 grava `nf_material_descontada` no item que
 * foi medido. Com transbordo, esse item pode ter abatido MAIS do que a NF
 * alocada a ele — o excesso veio do vizinho. Se calculássemos
 * `max(0, alocada_item − abatida_item)` item a item, esse excesso sumiria no
 * clamp e a NF do vizinho seria oferecida de novo no mês seguinte, descontando
 * duas vezes a mesma nota. Somar alocada e abatida do grupo inteiro ANTES de
 * clampar preserva a dívida e mantém o saldo corrido honesto.
 */

export interface ItemDesconto {
  detalhamentoId: string
  /** Grupo macro do detalhamento. Sem grupo, o item se resolve sozinho. */
  grupoId: string | null
  /** Material medido nesta medição. Zero para detalhamentos não medidos. */
  matMedido: number
  /** NF total alocada a este detalhamento (rateio pro-rata dos pedidos). */
  nfAlocada: number
  /** Quanto desta alocação já foi abatido em medições aprovadas anteriores. */
  nfJaAbatida: number
}

export interface ResultadoDesconto {
  /** Desconto que a NF do próprio detalhamento cobre. */
  direto: number
  /** Desconto coberto por NF de outro detalhamento do mesmo grupo. */
  transbordo: number
  /** direto + transbordo — é este o valor que abate o material medido. */
  total: number
}

/**
 * Apura o desconto por grupo macro e o distribui entre os itens medidos.
 *
 * A distribuição é proporcional ao material medido de cada item — nunca por
 * ordem de chegada, que faria o resultado depender da ordenação da query.
 */
export function calcularDescontoComTransbordo(
  itens: ItemDesconto[],
): Map<string, ResultadoDesconto> {
  const resultado = new Map<string, ResultadoDesconto>()

  const norm = (v: number) => Math.max(0, Number(v) || 0)
  /** Itens sem grupo não compartilham saldo; cada um vira seu próprio balde. */
  const chave = (it: ItemDesconto) => it.grupoId ?? `__sem_grupo__${it.detalhamentoId}`

  // 1) Soma alocada, abatida e material medido de cada grupo.
  const grupos = new Map<string, { alocada: number; abatida: number; medido: number }>()
  for (const it of itens) {
    const k = chave(it)
    const g = grupos.get(k) ?? { alocada: 0, abatida: 0, medido: 0 }
    g.alocada += norm(it.nfAlocada)
    g.abatida += norm(it.nfJaAbatida)
    g.medido += norm(it.matMedido)
    grupos.set(k, g)
  }

  // 2) Desconto do grupo: o que a NF ainda cobre, limitado ao que foi medido.
  const descontoGrupo = new Map<string, number>()
  for (const [k, g] of grupos) {
    const disponivel = Math.max(0, g.alocada - g.abatida)
    descontoGrupo.set(k, Math.min(g.medido, disponivel))
  }

  // 3) Distribui proporcionalmente ao material medido de cada item.
  for (const it of itens) {
    const matMedido = norm(it.matMedido)
    const k = chave(it)
    const g = grupos.get(k)!
    const doGrupo = descontoGrupo.get(k) ?? 0

    const total = g.medido > 0
      ? Math.min(matMedido, (matMedido / g.medido) * doGrupo)
      : 0

    // "Direto" é o quanto a própria nota do item cobriria sozinha; o resto
    // veio do grupo. Serve só para exibição e auditoria.
    const proprio = Math.max(0, norm(it.nfAlocada) - norm(it.nfJaAbatida))
    const direto = Math.min(total, proprio)

    resultado.set(it.detalhamentoId, {
      direto,
      transbordo: total - direto,
      total,
    })
  }

  return resultado
}
