/**
 * Desconto de NF de material apurado por TAREFA, sobre o ACUMULADO.
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
 * nível da TAREFA — o segundo nível da WBS (contratos → grupos_macro →
 * tarefas → detalhamentos), que é o código de dois níveis que o usuário vê:
 * "14.2 TUBOS E CONEXÕES - SPRINKLER", "16.1 INFRA SDAI".
 *
 * O NÍVEL DO BALDE — GRUPO MACRO POR PADRÃO, TAREFA POR EXCEÇÃO:
 *
 * Esta escolha já mudou duas vezes. O histórico importa porque cada direção
 * quebra uma coisa diferente:
 *
 *  v1 (grupo macro) — espelhava o Informakon, que desconta por macro item.
 *  v2 (tarefa, 29/07/2026) — o grupo macro mistura materiais de naturezas
 *     diferentes: o grupo 16 (SDAI) tem tanto "16.1 INFRA — eletrodutos e
 *     caixas" quanto "16.2 CABEAMENTO — cabo blindado". Na medição 005/2026
 *     itens de cabeamento sem nota nenhuma apareciam cobertos por nota de
 *     eletroduto. Aceitou-se, então, divergir do Informakon de propósito.
 *  v3 (grupo macro por padrão, configurável) — a divergência deliberada da v2
 *     virou o problema principal: o Informakon lança nota a nota mas as
 *     consolida no MACRO GRUPO, e é nesse nível que existe número dos dois
 *     lados. Apurar por tarefa garante que os totais nunca fechem, porque o
 *     outro lado não tem dado nessa granularidade. A conciliação só é
 *     possível onde ambos enxergam o mesmo balde.
 *
 * Por isso o nível voltou a ser o GRUPO MACRO, mas agora por grupo:
 * `grupos_macro.nivel_apuracao_nf` (migration 079) aceita 'grupo' (padrão) ou
 * 'tarefa'. Um grupo que de fato mistura materiais incompatíveis — o 16 é o
 * caso conhecido — pode ser fixado em 'tarefa' sem arrastar os outros 17
 * grupos junto, que era o custo da v2.
 *
 * CONSEQUÊNCIA: onde o nível é 'grupo', a apuração passa a bater com o
 * Informakon. Onde for fixado em 'tarefa', continua mais restritiva — vamos
 * apontar "FIP a criar" onde eles dão por coberto, e a diferença aparece na
 * conciliação por grupo (lib/db/informakon-conciliacao.ts).
 *
 * O TETO DA RÉGUA — e por que NÃO é o material contratado:
 *
 * O teto é o material MEDIDO acumulado: comprou R$ 200 mil de tubo, instalou
 * R$ 50 mil, desconta R$ 50 mil e o resto fica de saldo.
 *
 * Houve uma versão em que o teto passou a ser o material CONTRATADO, para
 * consumir a nota do fornecedor mais cedo e encolher o passivo de material
 * comprado e não reconhecido. O raciocínio era que o desconto não move o que
 * a Wave recebe — o `% a lançar` sobe junto com o desconto, então ela recebe
 * o serviço medido de qualquer jeito.
 *
 * É verdade que ela recebe o serviço medido. O que esse raciocínio ignorava é
 * o que acontece com o PERCENTUAL. Como
 *
 *     % a lançar = (serviço medido + desconto) / valor global
 *
 * descontar material que ainda não foi executado obriga a lançar percentual
 * que ainda não foi executado. Na obra WAVE isso produziu um item com
 * 8,0063% lançado no Informakon contra 5,00% de avanço físico — o ERP passou
 * a registrar mais execução do que existe no canteiro.
 *
 * Consumir a nota antes de medir o material e não lançar percentual acima do
 * físico são objetivos incompatíveis por construção. Prevalece o segundo: o
 * percentual é o que a FIP lê como avanço de obra, e um número inflado ali
 * contamina medição, cronograma e a conferência de todo mundo. A nota parada
 * é só um saldo esperando o material ser instalado.
 *
 * INVARIANTE QUE ISSO GARANTE:
 *
 *     Σ a lançar  =  Σ serviço + Σ desconto
 *                 ≤  Σ serviço + Σ material medido
 *                 =  valor medido acumulado
 *
 * ou seja, `% lançado acumulado ≤ % físico acumulado`, item a item e sempre.
 * O percentual de um PERÍODO ainda pode superar o físico do período — é a
 * devolução de percentual que ficou retido em meses anteriores, quando a nota
 * ainda não existia (ver `recuperacao`). O acumulado é que não passa nunca.
 *
 * O teto por ITEM não é estético: o item não pode absorver nota de vizinho
 * além do próprio material medido, senão o percentual dele passa do físico
 * dele — o mesmo erro na escala do item. O que não couber é redistribuído
 * entre os que ainda têm espaço (water-filling) e o resto fica em saldo.
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

/** Níveis possíveis do balde de apuração de NF. */
export type NivelApuracao = 'grupo' | 'tarefa'

/**
 * Nível usado quando o grupo não define nada — inclusive quando a migration
 * 079 ainda não rodou. É o macro grupo, que é onde o Informakon consolida.
 */
export const NIVEL_APURACAO_PADRAO: NivelApuracao = 'grupo'

/**
 * Resolve o balde de um item. Sem o nível preferido disponível cai no outro,
 * e sem nenhum dos dois o item vira seu próprio balde (não compartilha com
 * ninguém) — dado incompleto nunca deve fazer nota de um item cobrir outro
 * por acidente.
 */
function baldeDe(
  it: { detalhamentoId: string; tarefaId?: string | null; grupoId: string | null; nivelApuracao?: NivelApuracao | null },
): string {
  const nivel = it.nivelApuracao ?? NIVEL_APURACAO_PADRAO
  const preferido = nivel === 'tarefa' ? it.tarefaId : it.grupoId
  const alternativo = nivel === 'tarefa' ? it.grupoId : it.tarefaId
  return preferido ?? alternativo ?? `__sem_balde__${it.detalhamentoId}`
}

export interface ItemDesconto {
  detalhamentoId: string
  /** Nível do balde deste item, vindo de `grupos_macro.nivel_apuracao_nf`. */
  nivelApuracao?: NivelApuracao | null
  /**
   * Tarefa do detalhamento — o balde onde o saldo de NF é apurado.
   * Quando ausente (dado incompleto), cai para o grupo macro, que era o
   * comportamento anterior; nunca fica sem balde por falta deste campo.
   */
  tarefaId?: string | null
  /** Grupo macro do detalhamento. Sem grupo nem tarefa, o item se resolve sozinho. */
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
  /** Desconto coberto por NF de outro detalhamento da mesma tarefa. */
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
 * Apura o desconto acumulado por tarefa e distribui entre os itens medidos.
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
  const chave = baldeDe

  // 1) Soma por balde: alocada, abatida, material do período e o TETO.
  //
  //    O TETO É O MATERIAL MEDIDO ACUMULADO — nunca o contratado.
  //
  //    Essa escolha é o que garante o invariante do boletim:
  //
  //        Σ a lançar  =  Σ serviço + Σ desconto
  //                    ≤  Σ serviço + Σ material medido
  //                    =  valor medido acumulado
  //
  //    ou seja, o percentual ACUMULADO lançado no Informakon nunca passa do
  //    percentual físico acumulado. Você nunca libera no ERP mais do que a
  //    obra executou.
  //
  //    Já foi o material CONTRATADO, para consumir a nota mais cedo e zerar o
  //    saldo do fornecedor. Consumir a nota antes de medir o material exige
  //    liberar percentual antes de executar — foi o que produziu um item com
  //    8,0063% lançado contra 5,00% físico. As duas coisas são incompatíveis
  //    por construção, e esta é a que não mente sobre o avanço da obra.
  const grupos = new Map<string, {
    alocada: number; abatida: number; medido: number; teto: number
  }>()
  for (const it of itens) {
    const k = chave(it)
    const g = grupos.get(k) ?? { alocada: 0, abatida: 0, medido: 0, teto: 0 }
    const medido = norm(it.matMedido)
    // O teto nunca fica abaixo do que se está medindo agora: dado
    // inconsistente não pode impedir o desconto do próprio período.
    // O teto nunca fica abaixo do que se está medindo agora: dado
    // inconsistente não pode impedir o desconto do próprio período.
    const tetoItem = Math.max(norm(it.matAcumulado), medido)
    g.alocada += norm(it.nfAlocada)
    g.abatida += norm(it.nfJaAbatida)
    g.medido += medido
    g.teto += tetoItem
    grupos.set(k, g)
  }

  // 2) Régua acumulada: o desconto de toda a obra no balde é o menor entre o
  //    teto e a nota lançada. O do período é o que falta abater.
  const descontoGrupo = new Map<string, number>()
  for (const [k, g] of grupos) {
    descontoGrupo.set(k, Math.max(0, Math.min(g.teto, g.alocada) - g.abatida))
  }

  // 3) Distribui proporcionalmente ao material medido, respeitando o espaço
  //    de cada item (water-filling). Sem o teto por item, um item poderia
  //    receber mais nota do que o material que tem em contrato — e o
  //    "% a lançar" dele passaria de 100%, que o Informakon não aceita.
  const porBalde = new Map<string, ItemDesconto[]>()
  for (const it of itens) {
    const k = chave(it)
    const arr = porBalde.get(k)
    if (arr) arr.push(it)
    else porBalde.set(k, [it])
  }

  const alocado = new Map<string, number>()
  for (const it of itens) alocado.set(it.detalhamentoId, 0)

  for (const [k, doBalde] of porBalde) {
    let restante = descontoGrupo.get(k) ?? 0
    if (restante <= 0) continue

    // Só itens medidos no período recebem: gravar abatimento num item que não
    // foi medido quebraria o saldo corrido da migration 074.
    const participantes = doBalde.filter(it => norm(it.matMedido) > 0)
    if (participantes.length === 0) continue

    // Espaço de cada item: o material que ele já executou e ainda não teve
    // coberto por nota. Um item não pode absorver nota de vizinho além do
    // próprio material medido — senão o percentual DELE passaria do físico
    // dele, que é o mesmo erro na escala do item.
    const espaco = new Map<string, number>()
    for (const it of participantes) {
      const teto = Math.max(norm(it.matAcumulado), norm(it.matMedido))
      espaco.set(it.detalhamentoId, Math.max(0, teto - norm(it.nfJaAbatida)))
    }

    // Converge em poucas rodadas: cada rodada ou esgota `restante` ou satura
    // pelo menos um item, e o número de itens por balde é pequeno.
    for (let rodada = 0; rodada < 12 && restante > 1e-9; rodada++) {
      const comEspaco = participantes.filter(it => (espaco.get(it.detalhamentoId) ?? 0) > 1e-9)
      const somaPesos = comEspaco.reduce((acc, it) => acc + norm(it.matMedido), 0)
      if (comEspaco.length === 0 || somaPesos <= 0) break

      let distribuido = 0
      for (const it of comEspaco) {
        const quota = (norm(it.matMedido) / somaPesos) * restante
        const cabe = Math.min(quota, espaco.get(it.detalhamentoId) ?? 0)
        if (cabe <= 0) continue
        alocado.set(it.detalhamentoId, (alocado.get(it.detalhamentoId) ?? 0) + cabe)
        espaco.set(it.detalhamentoId, (espaco.get(it.detalhamentoId) ?? 0) - cabe)
        distribuido += cabe
      }
      if (distribuido <= 1e-9) break
      restante -= distribuido
    }
    // O que não coube continua em saldo e volta na próxima medição.
  }

  for (const it of itens) {
    const matMedido = norm(it.matMedido)
    const total = alocado.get(it.detalhamentoId) ?? 0

    // "Direto" é o quanto a própria nota do item cobriria sozinha; o resto
    // veio dos vizinhos do balde. Serve só para exibição e auditoria.
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
  /** Mesma regra de balde do desconto — ver `ItemDesconto.nivelApuracao`. */
  nivelApuracao?: NivelApuracao | null
  /** Mesma regra de balde do desconto — ver `ItemDesconto.tarefaId`. */
  tarefaId?: string | null
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
 * "FIP precisa criar nota nova" — também no nível da tarefa.
 *
 * Sem isto, o mesmo descasamento lote-x-pavimento que travava o desconto trava
 * a classificação: a Geração tem centenas de milhares em pedido aprovado sem
 * NF, mas alocados a detalhamentos diferentes dos medidos, então o sistema
 * pedia "NF nova" para material que já está comprado e só aguarda a nota.
 *
 * Usa o mesmo balde do desconto (grupo macro por padrão), pelos mesmos motivos.
 *
 * É classificação de exibição, não saldo corrido: nada aqui é gravado, e o
 * total classificado nunca passa do gap do próprio período.
 */
export function calcularSaldoAprovadoComTransbordo(
  itens: ItemSaldoAprovado[],
): Map<string, number> {
  const resultado = new Map<string, number>()
  const norm = (v: number) => Math.max(0, Number(v) || 0)
  const chave = baldeDe

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
