/**
 * Compensação de lastro entre macro itens (migration 085).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REGRA (usuário, 26/10/2026)
 *
 * O Informakon só abate nota lançada no MESMO macro item. Quando a nota do
 * material de um macro item G foi lançada em outro D, G fica sem lastro (a
 * camada ② corta o percentual) e D fica com lastro sobrando.
 *
 *     a FIP fatura a falta de G
 *     o saldo a gastar dos itens de D cai no mesmo valor, pelos primeiros itens
 *
 * A nota parada em D vai abater material de D no futuro. Sem reduzir o saldo
 * de D, alguém compraria de novo aquele material e a obra pagaria duas vezes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUANTO DÁ PARA COMPENSAR
 *
 *     teto = min( falta de G ,
 *                 Vlr. a Desc das notas em D que NÓS alocamos em G ,
 *                 lastro livre de D = saldo de D − o que D pede agora )
 *
 * "Nota que alocamos em G" é a prova de que aquele lastro é material de G: o
 * número da nota está num pedido que tem item em G. Nota de D que não tem
 * nada com G não serve de origem, mesmo que D tenha lastro sobrando.
 *
 * As compensações já registradas (em qualquer medição) saem dos dois lados.
 * Isso é conservador quando a nota da FIP já entrou no ERP — a falta de G já
 * caiu sozinha e ainda subtraímos de novo —, e é o lado certo do erro: sugerir
 * de menos volta no mês seguinte; sugerir de mais reduz saldo duas vezes.
 */

import { chaveMacroItem } from './comparar-saldo'
import { normalizarNumeroNota } from './conferir-notas'
import { compareCodigo } from '@/lib/db/wbs-utils'

const cent = (n: number) => Math.round(n * 100) / 100
const pos = (n: unknown) => Math.max(0, Number(n) || 0)

/** A chave da camada ② para um código de detalhamento. */
export function chaveDoCodigo(codigo: string | null | undefined): string {
  return chaveMacroItem(codigo)
}

export interface NotaNoMacroItem {
  /** Macro item em que a nota está, já no endereçamento do boletim. */
  chave: string
  numeroNf: string | null
  valorADescontar: number
}

export interface AlocacaoDaNota {
  numeroNf: string
  chave: string
  valor: number
}

export interface SugestaoCompensacao {
  chaveFalta: string
  chaveNota: string
  valor: number
  /** Números das notas de D que sustentam a sugestão. */
  notas: string[]
}

export interface EntradaSugestao {
  /** Falta por macro item, como a camada ② apurou nesta medição. */
  faltas: Map<string, number>
  notas: NotaNoMacroItem[]
  alocacao: AlocacaoDaNota[]
  /** "Vlr. a Desc" por macro item, no endereçamento do boletim. */
  saldoPorChave: Map<string, number>
  /** Desconto que o boletim pede em cada macro item, já depois do corte. */
  demandaPorChave: Map<string, number>
  compensadoPorChaveFalta?: Map<string, number>
  compensadoPorChaveNota?: Map<string, number>
}

export function sugerirCompensacoes(e: EntradaSugestao): SugestaoCompensacao[] {
  const chavesDaNota = new Map<string, Set<string>>()
  for (const a of e.alocacao) {
    const numero = normalizarNumeroNota(a.numeroNf)
    const chave = chaveMacroItem(a.chave) || String(a.chave ?? '').trim()
    if (!numero || !chave || !(pos(a.valor) > 0)) continue
    const s = chavesDaNota.get(numero) ?? new Set<string>()
    s.add(chave)
    chavesDaNota.set(numero, s)
  }

  const livre = new Map<string, number>()
  for (const [chave, saldo] of e.saldoPorChave) {
    livre.set(chave, Math.max(0, pos(saldo)
      - pos(e.demandaPorChave.get(chave))
      - pos(e.compensadoPorChaveNota?.get(chave))))
  }

  // Quanto de cada nota (por macro item D) ainda pode servir de origem.
  const restoDaNota = new Map<string, number>()
  const chaveDe = (numero: string, d: string) => `${d}|${numero}`
  for (const n of e.notas) {
    const numero = normalizarNumeroNota(n.numeroNf)
    if (!numero || !(pos(n.valorADescontar) > 0)) continue
    const k = chaveDe(numero, String(n.chave))
    restoDaNota.set(k, (restoDaNota.get(k) || 0) + pos(n.valorADescontar))
  }

  const faltas = [...e.faltas.entries()]
    .map(([g, v]) => [g, Math.max(0, pos(v) - pos(e.compensadoPorChaveFalta?.get(g)))] as const)
    .filter(([, v]) => v > 0.005)
    .sort((a, b) => b[1] - a[1])

  const out: SugestaoCompensacao[] = []
  for (const [g, falta] of faltas) {
    let aCobrir = falta
    // Candidatos D: macro itens de notas que alocamos em G, D ≠ G.
    const porD = new Map<string, string[]>()
    for (const n of e.notas) {
      const numero = normalizarNumeroNota(n.numeroNf)
      const d = String(n.chave)
      if (!numero || d === g || !chavesDaNota.get(numero)?.has(g)) continue
      const lista = porD.get(d) ?? []
      if (!lista.includes(numero)) lista.push(numero)
      porD.set(d, lista)
    }
    // Maior lastro livre primeiro — menos compensações picadas.
    const ds = [...porD.keys()].sort((a, b) => (livre.get(b) || 0) - (livre.get(a) || 0))
    for (const d of ds) {
      if (aCobrir <= 0.005) break
      let livreD = livre.get(d) || 0
      if (livreD <= 0.005) continue
      let valor = 0
      const usadas: string[] = []
      for (const numero of porD.get(d)!) {
        if (aCobrir - valor <= 0.005 || livreD <= 0.005) break
        const k = chaveDe(numero, d)
        const resto = restoDaNota.get(k) || 0
        const usa = Math.min(resto, aCobrir - valor, livreD)
        if (!(usa > 0.005)) continue
        restoDaNota.set(k, resto - usa)
        livreD -= usa
        valor += usa
        usadas.push(numero)
      }
      if (valor <= 0.005) continue
      livre.set(d, livreD)
      aCobrir -= valor
      out.push({ chaveFalta: g, chaveNota: d, valor: cent(valor), notas: usadas })
    }
  }
  return out
}

export interface ItemDestino {
  detalhamentoId: string
  codigo: string
  /** Saldo a gastar de material do item (pode vir negativo: é ignorado). */
  saldo: number
}

/**
 * Reduz o saldo a gastar pelos PRIMEIROS itens do macro item, em ordem de
 * código, cada um até o próprio saldo. O que não couber volta em `semEspaco`
 * — quem chama recusa a compensação em vez de gravar um saldo negativo.
 */
export function distribuirNosItens(valor: number, itens: ItemDestino[]): {
  distribuicao: Array<{ detalhamentoId: string; valor: number }>
  semEspaco: number
} {
  let resta = pos(valor)
  const distribuicao: Array<{ detalhamentoId: string; valor: number }> = []
  for (const it of [...itens].sort((a, b) => compareCodigo(a.codigo, b.codigo))) {
    if (resta <= 0.005) break
    const cabe = Math.min(resta, pos(it.saldo))
    if (!(cabe > 0.005)) continue
    distribuicao.push({ detalhamentoId: it.detalhamentoId, valor: cent(cabe) })
    resta -= cabe
  }
  return { distribuicao, semEspaco: cent(Math.max(0, resta)) }
}
