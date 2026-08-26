/**
 * Casa NOTA A NOTA o que o FIP-WAVE tem com o que está lançado no Informakon.
 *
 * O painel de teto de realidade responde QUANTO falta lançar. Isso não basta:
 * quem vai ao ERP precisa saber QUAL nota lançar. Enquanto o retrato era só o
 * somatório por macro item, a resposta era estatística — listar as notas do
 * grupo da mais recente para a mais antiga e apostar nas de cima.
 *
 * Com o retrato detalhado (migration 081) a resposta vira determinística: se
 * a NF-e 534 está do nosso lado e não está no retrato, ela não foi lançada.
 * Ponto.
 *
 * O que casa é o NÚMERO da nota, não o valor. O valor dos dois lados nasce de
 * rateios diferentes — nós rateamos a nota pelos itens do pedido dentro do
 * escopo, o Informakon amarra a nota ao item do pedido dele — então divergir
 * em centavos (ou em alguns milhares, numa nota que atende dois macro itens)
 * é normal e NÃO significa erro. Ausência significa.
 */

export type SituacaoNota =
  /** Não está no retrato deste macro item — é o que falta lançar. */
  | 'nao_lancada'
  /** Está no retrato, mas em OUTRO macro item — foi lançada no lugar errado. */
  | 'outro_macro_item'
  /** Lançada e com saldo integral a descontar. */
  | 'disponivel'
  /** Lançada, parte já descontada em medição anterior, parte ainda disponível. */
  | 'parcial'
  /** O ERP já consumiu inteira em medição anterior. */
  | 'ja_descontada'
  /** Aparece no retrato zerada dos dois lados — nada a fazer com ela. */
  | 'sem_saldo'

/** Uma nota do nosso lado, como vem do drill-down de origem. */
export interface NotaDoSistema {
  id: string
  numero: string
  data: string
  emitente: string | null
  valorAlocado: number
  status: string
  arquivoUrl: string | null
}

/** Uma linha do retrato do Informakon (uma nota dentro de um macro item). */
export interface NotaDoErp {
  /** '1'..'18' ou '19.1.x' — mesma chave de `chaveMacroItem`. */
  chave: string
  documento: string
  numeroNf: string | null
  macroItem?: string
  valorADescontar: number
  valorDescontado: number
}

export interface LinhaConferencia {
  /** Número normalizado — a chave do casamento. */
  numero: string
  situacao: SituacaoNota
  /** Σ do que alocamos dessa nota neste macro item. */
  nosso: number
  /** Σ "Vlr. a Desc" do retrato (0 quando a nota não está lá). */
  erpADescontar: number
  /** Σ "Vlr.Desc" do retrato. */
  erpDescontado: number
  /** Rótulo do macro item onde o ERP colocou a nota, quando é outro. */
  macroItemNoErp: string | null
  /** As nossas linhas com esse número — normalmente uma só. */
  notas: NotaDoSistema[]
}

export interface NotaSoNoErp {
  numero: string
  documento: string
  erpADescontar: number
  erpDescontado: number
}

export interface ConferenciaNotas {
  /** Todas as nossas notas do macro item, ação primeiro. */
  linhas: LinhaConferencia[]
  /** O que precisa ser lançado no ERP — a resposta da pergunta. */
  naoLancadas: LinhaConferencia[]
  /** Lançadas no macro item errado — corrigir lá, não emitir nota nova. */
  foraDoMacroItem: LinhaConferencia[]
  /** Está no retrato e não temos do nosso lado — cadastro faltando aqui. */
  soNoErp: NotaSoNoErp[]
  /** Σ do nosso valor alocado nas notas não lançadas. */
  totalNaoLancado: number
  /** Σ "Vlr. a Desc" das notas que casaram — o que dá para descontar hoje. */
  totalDisponivel: number
  /** Σ "Vlr.Desc" das notas que casaram — o que o ERP já consumiu. */
  totalJaDescontado: number
  /**
   * true quando o que não foi lançado explica a falta apontada pelo painel
   * (dentro de R$ 1). Aí a lista abaixo é a receita completa: lance essas.
   */
  explicaFalta: boolean
}

/** Centavo de rateio não é divergência; o casamento é pelo número. */
const TOL = 0.01

/**
 * Só os dígitos, sem zero à esquerda: '0000534', 'NF-e 534' e '534' são a
 * mesma nota. Devolve '' quando não sobra dígito nenhum.
 */
export function normalizarNumeroNota(numero: string | null | undefined): string {
  const so = String(numero ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return so
}

const cent = (n: number) => Math.round(n * 100) / 100

interface AggErp {
  aDescontar: number
  descontado: number
  documento: string
  macroItem: string | null
}

function agregarErp(notas: NotaDoErp[]): Map<string, AggErp> {
  const out = new Map<string, AggErp>()
  for (const n of notas) {
    const numero = normalizarNumeroNota(n.numeroNf ?? n.documento)
    if (!numero) continue
    const atual = out.get(numero)
    if (atual) {
      atual.aDescontar += Number(n.valorADescontar) || 0
      atual.descontado += Number(n.valorDescontado) || 0
      continue
    }
    out.set(numero, {
      aDescontar: Number(n.valorADescontar) || 0,
      descontado: Number(n.valorDescontado) || 0,
      documento: n.documento,
      macroItem: n.macroItem ?? null,
    })
  }
  return out
}

function situacaoDe(agg: AggErp): SituacaoNota {
  const a = agg.aDescontar
  const d = agg.descontado
  if (a > TOL && d > TOL) return 'parcial'
  if (a > TOL) return 'disponivel'
  if (d > TOL) return 'ja_descontada'
  return 'sem_saldo'
}

/** Ação primeiro; dentro de cada bloco, o maior valor primeiro. */
const PESO: Record<SituacaoNota, number> = {
  nao_lancada: 0,
  outro_macro_item: 1,
  disponivel: 2,
  parcial: 3,
  ja_descontada: 4,
  sem_saldo: 5,
}

export function conferirNotas({
  nossas,
  erp,
  chave,
  falta = 0,
}: {
  /** Notas do FIP-WAVE alocadas neste macro item. */
  nossas: NotaDoSistema[]
  /** Retrato inteiro do Informakon — a função separa o que é deste macro item. */
  erp: NotaDoErp[]
  /** Macro item em conferência ('14', '19.1.2', …). */
  chave: string
  /** Quanto o painel diz que falta lançar neste macro item. */
  falta?: number
}): ConferenciaNotas {
  const doMacroItem = agregarErp(erp.filter(n => n.chave === chave))
  const deOutros = agregarErp(erp.filter(n => n.chave !== chave))

  /** Nossas notas agrupadas por número: o mesmo número é a mesma nota. */
  const porNumero = new Map<string, LinhaConferencia>()
  for (const nf of nossas) {
    const numero = normalizarNumeroNota(nf.numero)
    if (!numero) continue
    const atual = porNumero.get(numero)
    if (atual) {
      atual.nosso += Number(nf.valorAlocado) || 0
      atual.notas.push(nf)
      continue
    }
    porNumero.set(numero, {
      numero,
      situacao: 'nao_lancada',
      nosso: Number(nf.valorAlocado) || 0,
      erpADescontar: 0,
      erpDescontado: 0,
      macroItemNoErp: null,
      notas: [nf],
    })
  }

  for (const linha of porNumero.values()) {
    const aqui = doMacroItem.get(linha.numero)
    if (aqui) {
      linha.erpADescontar = cent(aqui.aDescontar)
      linha.erpDescontado = cent(aqui.descontado)
      linha.situacao = situacaoDe(aqui)
      continue
    }
    const outro = deOutros.get(linha.numero)
    if (outro) {
      linha.erpADescontar = cent(outro.aDescontar)
      linha.erpDescontado = cent(outro.descontado)
      linha.macroItemNoErp = outro.macroItem
      linha.situacao = 'outro_macro_item'
      continue
    }
    linha.situacao = 'nao_lancada'
  }

  const linhas = [...porNumero.values()]
  for (const l of linhas) l.nosso = cent(l.nosso)
  linhas.sort((a, b) => {
    if (PESO[a.situacao] !== PESO[b.situacao]) return PESO[a.situacao] - PESO[b.situacao]
    return b.nosso - a.nosso
  })

  const soNoErp: NotaSoNoErp[] = []
  for (const [numero, agg] of doMacroItem) {
    if (porNumero.has(numero)) continue
    soNoErp.push({
      numero,
      documento: agg.documento,
      erpADescontar: cent(agg.aDescontar),
      erpDescontado: cent(agg.descontado),
    })
  }
  soNoErp.sort((a, b) => (b.erpADescontar + b.erpDescontado) - (a.erpADescontar + a.erpDescontado))

  const naoLancadas = linhas.filter(l => l.situacao === 'nao_lancada')
  const foraDoMacroItem = linhas.filter(l => l.situacao === 'outro_macro_item')
  const casadas = linhas.filter(l => l.situacao !== 'nao_lancada' && l.situacao !== 'outro_macro_item')
  const totalNaoLancado = cent(naoLancadas.reduce((s, l) => s + l.nosso, 0))

  return {
    linhas,
    naoLancadas,
    foraDoMacroItem,
    soNoErp,
    totalNaoLancado,
    totalDisponivel: cent(casadas.reduce((s, l) => s + l.erpADescontar, 0)),
    totalJaDescontado: cent(casadas.reduce((s, l) => s + l.erpDescontado, 0)),
    explicaFalta: falta > TOL && Math.abs(totalNaoLancado - falta) <= 1,
  }
}
