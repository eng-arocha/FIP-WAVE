/**
 * Desconto de NF de material apurado por grupo macro, sobre o ACUMULADO.
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
 * A RÉGUA ACUMULADA (por que não se apura sobre o material do período):
 *
 * Apurar mês a mês não recupera o que ficou para trás. Uma nota que deixou de
 * descontar no mês certo — porque estava alocada no detalhamento errado, sob a
 * regra antiga item-a-item — ficava perdida para sempre. Por isso o saldo é
 * apurado como numa medição física acumulada:
 *
 *   desconto_acumulado  = MENOR(material_acumulado, nf_alocada)   <- a trava
 *   desconto_do_periodo = desconto_acumulado − já_abatido
 *
 * A trava do MENOR garante que nunca se desconte nota de material que ainda
 * não foi executado: comprou R$ 200 mil de tubo, instalou R$ 50 mil, desconta
 * R$ 50 mil e o resto fica de saldo. O inverso — material executado além da
 * nota lançada — é nota que falta de verdade e a FIP precisa emitir.
 *
 * Consequência esperada: o desconto de um período PODE superar o material
 * medido naquele período. Não é erro, é o acerto de contas dos meses
 * anteriores voltando de uma vez. Esse excedente sai em `recuperacao` para
 * poder aparecer explicitamente no rodapé — sem ele a conta
 * "material − desconto = FIP a criar" não fecha.
 *
 * POR QUE ALOCADA E ABATIDA SÃO SOMADAS ANTES DE QUALQUER CLAMP:
 *
 * O saldo corrido da migration 074 grava `nf_material_descontada` no item que
 * foi medido. Com transbordo, esse item pode ter abatido MAIS do que a NF
 * alocada a ele — o excesso veio do vizinho. Se calculássemos item a item, esse
 * excesso sumiria no clamp e a NF do vizinho seria oferecida de novo no mês
 * seguinte, descontando duas vezes a mesma nota. Somar o grupo inteiro ANTES
 * preserva a dívida e mantém o saldo corrido honesto.
 */

export interface ItemDesconto {
  detalhamentoId: string
  /** Grupo macro do detalhamento. Sem grupo, o item se resolve sozinho. */
  grupoId: string | null
  /** Material medido nesta medição. Zero para detalhamentos não medidos. */
  matMedido: number
  /**
   * Material medido ACUMULADO (medições aprovadas + esta). É o teto da régua.
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
  /** Desconto que a NF do próprio detalhamento cobre. */
  direto: number
  /** Desconto coberto por NF de outro detalhamento do mesmo grupo. */
  transbordo: number
  /**
   * Parte do total que excede o material medido NO PERÍODO — nota de meses
   * anteriores que não descontou na época e está sendo recuperada agora.
   * Já está dentro de `total`; é só para exibição no rodapé.
   */
  recuperacao: number
  /** direto + transbordo — é este o valor que abate o material medido. */
  total: number
}

/**
 * Apura o desconto acumulado por grupo macro e distribui entre os itens medidos.
 *
 * A distribuição é proporcional ao material medido de cada item — nunca por
 * ordem de chegada, que faria o resultado depender da ordenação da query.
 * Itens sem material medido no período não recebem desconto: gravar abatimento
 * num item que não foi medido quebraria o saldo corrido da migration 074.
 */
export function calcularDescontoComTransbordo(
  itens: ItemDesconto[],
): Map<string, ResultadoDesconto> {
  const resultado = new Map<string, ResultadoDesconto>()

  const norm = (v: number) => Math.max(0, Number(v) || 0)
  /** Itens sem grupo não compartilham saldo; cada um vira seu próprio balde. */
  const chave = (it: ItemDesconto) => it.grupoId ?? `__sem_grupo__${it.detalhamentoId}`

  // 1) Soma alocada, abatida, material do período e material acumulado.
  const grupos = new Map<string, {
    alocada: number; abatida: number; medido: number; acumulado: number
  }>()
  for (const it of itens) {
    const k = chave(it)
    const g = grupos.get(k) ?? { alocada: 0, abatida: 0, medido: 0, acumulado: 0 }
    const medido = norm(it.matMedido)
    g.alocada += norm(it.nfAlocada)
    g.abatida += norm(it.nfJaAbatida)
    g.medido += medido
    // O acumulado sempre contém o período. Dado inconsistente não pode fazer
    // o teto ficar abaixo do que se está medindo agora.
    g.acumulado += Math.max(norm(it.matAcumulado), medido)
    grupos.set(k, g)
  }

  // 2) Régua acumulada: o desconto de toda a obra no grupo é o menor entre o
  //    material executado e a nota lançada. O do período é o que falta abater.
  const descontoGrupo = new Map<string, number>()
  for (const [k, g] of grupos) {
    const acumulado = Math.min(g.acumulado, g.alocada)
    descontoGrupo.set(k, Math.max(0, acumulado - g.abatida))
  }

  // 3) Distribui proporcionalmente ao material medido de cada item.
  for (const it of itens) {
    const matMedido = norm(it.matMedido)
    const k = chave(it)
    const g = grupos.get(k)!
    const doGrupo = descontoGrupo.get(k) ?? 0

    const total = g.medido > 0 ? (matMedido / g.medido) * doGrupo : 0

    // "Direto" é o quanto a própria nota do item cobriria sozinha; o resto
    // veio do grupo. Serve só para exibição e auditoria.
    const proprio = Math.max(0, norm(it.nfAlocada) - norm(it.nfJaAbatida))
    const direto = Math.min(total, proprio)

    resultado.set(it.detalhamentoId, {
      direto,
      transbordo: total - direto,
      recuperacao: Math.max(0, total - matMedido),
      total,
    })
  }

  return resultado
}

export interface ItemSaldoAprovado {
  detalhamentoId: string
  grupoId: string | null
  /** Material medido que a NF não cobriu — o que precisa ser classificado. */
  gapMaterial: number
  /** Valor de pedido de fat. direto APROVADO alocado a este detalhamento. */
  aprovado: number
  /** NF já emitida contra esses pedidos, alocada a este detalhamento. */
  nfAlocada: number
}

/**
 * Classifica o gap de material entre "pedido aprovado, NF pendente" e
 * "FIP precisa criar nota nova" — também no nível do grupo macro.
 *
 * Sem isto, o mesmo descasamento lote-x-pavimento que travava o desconto trava
 * a classificação: a Geração tem centenas de milhares em pedido aprovado sem
 * NF, mas alocados a detalhamentos diferentes dos medidos, então o sistema
 * pedia "NF nova" para material que já está comprado e só aguarda a nota.
 *
 * É classificação de exibição, não saldo corrido: nada aqui é gravado, e o
 * total classificado nunca passa do gap do próprio período.
 */
export function calcularSaldoAprovadoComTransbordo(
  itens: ItemSaldoAprovado[],
): Map<string, number> {
  const resultado = new Map<string, number>()
  const norm = (v: number) => Math.max(0, Number(v) || 0)
  const chave = (it: ItemSaldoAprovado) => it.grupoId ?? `__sem_grupo__${it.detalhamentoId}`

  const grupos = new Map<string, { aprovado: number; nf: number; gap: number }>()
  for (const it of itens) {
    const k = chave(it)
    const g = grupos.get(k) ?? { aprovado: 0, nf: 0, gap: 0 }
    g.aprovado += norm(it.aprovado)
    g.nf += norm(it.nfAlocada)
    g.gap += norm(it.gapMaterial)
    grupos.set(k, g)
  }

  for (const it of itens) {
    const gap = norm(it.gapMaterial)
    const g = grupos.get(chave(it))!
    const pool = Math.max(0, g.aprovado - g.nf)
    const coberto = Math.min(g.gap, pool)
    resultado.set(
      it.detalhamentoId,
      g.gap > 0 ? Math.min(gap, (gap / g.gap) * coberto) : 0,
    )
  }

  return resultado
}
