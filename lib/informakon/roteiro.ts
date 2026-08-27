/**
 * Roteiro de lançamento no Informakon.
 *
 * O boletim é analítico — pensa por item, em colunas. O lançamento é
 * operacional: acontece por MACRO GRUPO, com dois números digitados à mão (o
 * percentual de cada item e o valor do desconto) e um limite de lastro nota a
 * nota. Traduzir de um para o outro de cabeça, todo mês, é onde o erro mora.
 *
 * Este módulo faz a tradução.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A MECÂNICA DO ERP, como o usuário a descreveu
 *
 * 1. O Informakon calcula a liberação sobre o valor TOTAL do item
 *    (material + serviço), sem separar os dois.
 * 2. O abatimento NÃO é automático: o valor do desconto é digitado à mão
 *    durante a medição.
 * 3. O desconto só é aceito até o lastro de notas de faturamento direto já
 *    lançadas lá — e o saldo é consolidado no macro grupo, que pode compensar
 *    entre os itens dele.
 * 4. Sem lastro, o desconto trava: a FIP precisa emitir e lançar uma nota de
 *    material antes de a medição poder ser liberada.
 *
 * Exemplo do usuário: item com R$ 5.000 de material e R$ 5.000 de serviço,
 * 5% executado. Ele digita 5%, o ERP libera R$ 500, e ele digita R$ 250 de
 * desconto — sobra o serviço executado. Sem digitar, o ERP liberaria R$ 500.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DESCONTO É DIGITADO EM BLOCO — a repartição é PROVA, não instrução
 *
 * No pedido mãe o desconto entra como UM valor por macro grupo; o ERP não
 * pede nota a nota. A repartição FIFO calculada aqui existe para responder
 * outra pergunta: esse valor tem lastro lançado que o sustente, e vindo de
 * quais notas? É o que a conferência precisa quando o ERP recusa o bloco por
 * falta de saldo — e é `faltaLastro` que diz de quanto é o buraco.
 *
 * POR QUE FIFO
 *
 * Escolha do usuário: consome primeiro o saldo mais antigo. Drena as notas
 * velhas antes das novas e mantém a idade do saldo honesta.
 *
 * A data vem do NOSSO cadastro (`data_emissao`), porque o retrato do ERP não
 * traz data. Nota que só existe lá fica no fim da fila — sem data não dá para
 * afirmar que é antiga, e mandar consumir primeiro o que não se sabe datar
 * seria inventar ordem.
 */

/** Uma nota com saldo disponível para desconto no Informakon. */
export interface NotaLastro {
  /** Número normalizado — a chave que casa os dois lados. */
  numero: string
  /** 'NF-e 534', como aparece no ERP. */
  documento: string
  /** Data de emissão do nosso cadastro. `null` = nota só conhecida do ERP. */
  data: string | null
  /** "Vlr. a Desc" do retrato: o quanto ainda dá para descontar desta nota. */
  saldo: number
}

export interface LinhaDistribuicao extends NotaLastro {
  /** Quanto digitar de desconto NESTA nota. */
  usar: number
}

export interface DistribuicaoDesconto {
  /** Só as notas que recebem valor — o que vai para a tela, na ordem de digitar. */
  linhas: LinhaDistribuicao[]
  /** Σ `usar`. Igual ao total pedido quando há lastro suficiente. */
  distribuido: number
  /**
   * Quanto do desconto não tem lastro no ERP. Maior que zero significa que o
   * lançamento não fecha: ou a FIP emite nota, ou o percentual precisa cair.
   */
  faltaLastro: number
  /** Saldo que sobrou nas notas depois de atender o desconto. */
  saldoRemanescente: number
}

const cent = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * Ordem de consumo: mais antiga primeiro; sem data, por último. Entre iguais,
 * o número da nota decide — sem isso a ordem dependeria da ordem da query e o
 * roteiro mudaria de um refresh para o outro.
 */
export function ordenarFifo(notas: NotaLastro[]): NotaLastro[] {
  return [...notas].sort((a, b) => {
    const da = a.data ?? ''
    const db = b.data ?? ''
    if (!da !== !db) return da ? -1 : 1
    if (da !== db) return da.localeCompare(db)
    return String(a.numero).localeCompare(String(b.numero), 'pt-BR', { numeric: true })
  })
}

/**
 * Reparte `total` entre as notas, na ordem FIFO, sem passar do saldo de
 * nenhuma. Devolve exatamente o que o usuário vai digitar, linha a linha.
 */
export function distribuirDescontoFifo(
  total: number,
  notas: NotaLastro[],
): DistribuicaoDesconto {
  const alvo = Math.max(0, cent(num(total)))
  const fila = ordenarFifo(notas.filter(n => num(n.saldo) > 0.001))

  const linhas: LinhaDistribuicao[] = []
  let restante = alvo
  for (const nota of fila) {
    if (restante <= 0.001) break
    const usar = cent(Math.min(num(nota.saldo), restante))
    if (usar <= 0) continue
    linhas.push({ ...nota, saldo: cent(num(nota.saldo)), usar })
    restante = cent(restante - usar)
  }

  const distribuido = cent(linhas.reduce((s, l) => s + l.usar, 0))
  const saldoTotal = cent(fila.reduce((s, n) => s + num(n.saldo), 0))
  return {
    linhas,
    distribuido,
    faltaLastro: cent(Math.max(0, alvo - distribuido)),
    saldoRemanescente: cent(Math.max(0, saldoTotal - distribuido)),
  }
}

/** Um item do grupo, na ordem e na nomenclatura em que se digita no ERP. */
export interface ItemRoteiro {
  codigo: string
  /** Código do item no Informakon ('1382/38') — é ele que aparece lá. */
  codigoInformakon: string | null
  descricao: string
  /** O percentual que se digita. */
  pct: number
  /** `% × valor global do item` — o que o ERP libera nesta linha. */
  liberacao: number
  /** Avanço físico acumulado, para conferir que o % não adianta medição. */
  pctFisicoAcumulado: number
  pctLancadoAcumulado: number
}

export interface GrupoRoteiro {
  chave: string
  rotulo: string
  itens: ItemRoteiro[]
  /** Σ das liberações — o que o ERP vai soltar no grupo. */
  liberacao: number
  /** O desconto de material a digitar no grupo. */
  desconto: number
  /** O que tem de sobrar depois do desconto: o serviço medido do grupo. */
  servico: number
  /** Nota de material que a FIP precisa emitir e lançar ANTES do lançamento. */
  fipPrecisaEmitir: number
  /** Como repartir o desconto entre as notas, na ordem de digitar. */
  distribuicao: DistribuicaoDesconto
  /** true quando o grupo fecha: liberação − desconto = serviço. */
  fecha: boolean
}

/** Monta o bloco de um macro grupo. Não consulta nada: recebe tudo pronto. */
export function montarGrupo(args: {
  chave: string
  rotulo: string
  itens: ItemRoteiro[]
  desconto: number
  servico: number
  fipPrecisaEmitir: number
  lastro: NotaLastro[]
}): GrupoRoteiro {
  const liberacao = cent(args.itens.reduce((s, i) => s + num(i.liberacao), 0))
  const desconto = cent(num(args.desconto))
  const servico = cent(num(args.servico))
  const fip = cent(num(args.fipPrecisaEmitir))
  const distribuicao = distribuirDescontoFifo(desconto, args.lastro)

  // A prova do bloco ③: o que o ERP libera, menos o que se desconta (o
  // desconto do material mais a nota da FIP), tem de dar o serviço medido.
  const fecha = Math.abs(liberacao - desconto - fip - servico) < 0.02

  return {
    chave: args.chave,
    rotulo: args.rotulo,
    itens: args.itens,
    liberacao,
    desconto,
    servico,
    fipPrecisaEmitir: fip,
    distribuicao,
    fecha,
  }
}
