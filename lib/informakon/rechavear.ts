/**
 * Reagrupa o retrato do Informakon usando a NOSSA classificação das notas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O PROBLEMA — "a nota está no macro item errado"
 *
 * A conferência nota a nota mostrou notas presentes no retrato, porém em
 * outro macro item. A primeira leitura foi "corrigir o lançamento lá". Está
 * errada, por dois motivos:
 *
 * 1. Lançamento já feito no Informakon não se corrige. Dá para lançar o que
 *    falta; não dá para mover o que já entrou.
 *
 * 2. Não é erro de ninguém. O macro item do ERP é propriedade do ITEM DO
 *    PEDIDO da FIP, não da nota. No retrato de 26/08, 24 das 180 notas
 *    aparecem em mais de um macro item — a NF-e 206 aparece em SETE. Do
 *    nosso lado a mesma nota é rateada pelos detalhamentos do nosso pedido.
 *    São duas classificações diferentes do mesmo material, e a diferença vai
 *    se repetir em toda medição.
 *
 * Comparar macro item a macro item, então, mede duas coisas ao mesmo tempo:
 * nota que falta lançar (real, acionável) e nota classificada em outro lugar
 * (ruído, sem ação possível). Só a primeira é problema.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A SOLUÇÃO
 *
 * O número da nota é o único identificador que os dois lados compartilham.
 * Então o retrato é reagrupado por ele: para cada nota que o FIP-WAVE
 * conhece, o valor que o ERP tem daquela nota é redistribuído nos macro
 * itens em que NÓS a alocamos, na proporção da nossa própria alocação.
 *
 * O total do retrato não muda — nem um centavo entra ou sai. O que muda é o
 * endereço: o saldo passa a ser lido no mesmo idioma em que o boletim pede o
 * desconto. Nota que o ERP tem e nós não conhecemos fica onde está: sem o
 * nosso lado, não há por que mover.
 *
 * Depois disso, "falta lançar" volta a significar uma coisa só: essa nota
 * não está no Informakon. É o que dá para resolver — lançando.
 */

import { chaveMacroItem } from './comparar-saldo'
import { normalizarNumeroNota } from './conferir-notas'

/** Quanto de uma nota o FIP-WAVE alocou em um macro item. */
export interface AlocacaoNossa {
  numeroNf: string
  /** '1'..'18' ou '19.1.x' — a mesma chave de `chaveMacroItem`. */
  chave: string
  valor: number
}

/** Uma linha do retrato: uma nota dentro de um macro item do ERP. */
export interface NotaRetrato {
  chave: string
  numeroNf: string | null
  documento?: string
  macroItem?: string
  valorADescontar: number
  valorDescontado: number
}

export interface SaldoPorChave {
  aDescontar: number
  descontado: number
}

export interface NotaRealocada {
  numero: string
  documento: string
  /** Macro item em que o ERP lançou. */
  deChave: string
  /** Macro itens em que o FIP-WAVE aloca a nota. */
  paraChaves: string[]
  valor: number
}

export interface RetratoRechaveado {
  /** Saldo por macro item, já no endereçamento do boletim. */
  porChave: Map<string, SaldoPorChave>
  /**
   * As mesmas notas, já reendereçadas — uma linha por (nota × macro item
   * nosso). É o que a conferência nota a nota consome, para que ela procure a
   * nota onde o boletim a pede e não onde o ERP a arquivou.
   */
  notas: NotaRetrato[]
  /** Notas cujo endereço mudou — a prova de que nada sumiu no caminho. */
  realocadas: NotaRealocada[]
  /** Σ movimentado. Zero = as duas classificações já concordavam. */
  totalRealocado: number
}

const cent = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

function somar(mapa: Map<string, SaldoPorChave>, chave: string, a: number, d: number) {
  if (!chave) return
  const atual = mapa.get(chave)
  if (atual) {
    atual.aDescontar += a
    atual.descontado += d
    return
  }
  mapa.set(chave, { aDescontar: a, descontado: d })
}

/**
 * Reagrupa o retrato. `alocacao` é a nossa distribuição das notas por macro
 * item (número da nota → macro item → valor alocado).
 *
 * Nota conhecida por nós é redistribuída na proporção da nossa alocação;
 * nota desconhecida fica no macro item do ERP.
 */
export function rechavearRetrato(
  notas: NotaRetrato[],
  alocacao: AlocacaoNossa[],
): RetratoRechaveado {
  /** número → (chave → valor alocado por nós). */
  const nossa = new Map<string, Map<string, number>>()
  for (const a of alocacao) {
    const numero = normalizarNumeroNota(a.numeroNf)
    const chave = chaveMacroItem(a.chave) || String(a.chave ?? '').trim()
    const valor = num(a.valor)
    if (!numero || !chave || !(valor > 0)) continue
    const porChave = nossa.get(numero) ?? new Map<string, number>()
    porChave.set(chave, (porChave.get(chave) || 0) + valor)
    nossa.set(numero, porChave)
  }

  const porChave = new Map<string, SaldoPorChave>()
  const saida: NotaRetrato[] = []
  const realocadas: NotaRealocada[] = []
  let totalRealocado = 0

  for (const n of notas) {
    const chaveErp = String(n.chave ?? '').trim()
    const a = num(n.valorADescontar)
    const d = num(n.valorDescontado)
    const numero = normalizarNumeroNota(n.numeroNf ?? n.documento)
    const destino = numero ? nossa.get(numero) : undefined

    // Sem número, ou nota que não conhecemos: fica onde o ERP colocou.
    if (!destino || destino.size === 0) {
      somar(porChave, chaveErp, a, d)
      saida.push({ ...n, chave: chaveErp })
      continue
    }

    // Já está num macro item em que também alocamos: nada a mover. Evita
    // espalhar o valor de uma nota que o ERP já quebrou item a item —
    // reespalhar em cima disso só embaralharia o que já estava certo.
    if (destino.has(chaveErp)) {
      somar(porChave, chaveErp, a, d)
      saida.push({ ...n, chave: chaveErp })
      continue
    }

    const base = [...destino.values()].reduce((s, v) => s + v, 0)
    if (!(base > 0)) {
      somar(porChave, chaveErp, a, d)
      saida.push({ ...n, chave: chaveErp })
      continue
    }

    for (const [chave, valor] of destino) {
      const fracao = valor / base
      somar(porChave, chave, a * fracao, d * fracao)
      saida.push({
        ...n,
        chave,
        valorADescontar: cent(a * fracao),
        valorDescontado: cent(d * fracao),
      })
    }
    if (a + d > 0.01) {
      realocadas.push({
        numero,
        documento: n.documento ?? `NF ${numero}`,
        deChave: chaveErp,
        paraChaves: [...destino.keys()].sort(),
        valor: cent(a + d),
      })
      totalRealocado = cent(totalRealocado + a + d)
    }
  }

  for (const v of porChave.values()) {
    v.aDescontar = cent(v.aDescontar)
    v.descontado = cent(v.descontado)
  }
  realocadas.sort((x, y) => y.valor - x.valor)
  return { porChave, notas: saida, realocadas, totalRealocado }
}
