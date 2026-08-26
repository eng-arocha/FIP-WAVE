/**
 * Parser da COLAGEM do "Vlr. a Desc" por macro item do Informakon.
 *
 * O usuário exporta uma tabela dinâmica do ERP e cola o texto direto. Formato
 * típico (rótulo, TAB, valor em pt-BR):
 *
 *   Rótulos de Linha	Soma de Vlr. a Desc
 *   Faturamento direto  -  ALIMENTAÇÃO ELÉTRICA	515.299,66
 *   Faturamento direto  - ÁGUA PLUVIAL	375.254,16
 *   Total Geral	3.327.113,20
 *
 * O separador varia (TAB ao colar do Excel, múltiplos espaços ao colar de
 * outro lugar), o prefixo "Faturamento direto -" aparece com um ou dois
 * espaços, e o macro item do grupo 19 vem quebrado em detalhamento. Tudo isso
 * já é tratado por `extrairMacroItem` / `resolverDePara`, que são as MESMAS
 * funções usadas na importação do xlsx — se um dia o Informakon renomear um
 * macro item, os dois caminhos passam a reconhecer juntos.
 */

import { extrairMacroItem, resolverDePara, normalizar } from './parser'

export interface LinhaSaldoColada {
  /** Rótulo exatamente como veio — a prova do que foi informado. */
  macroItem: string
  /** Texto normalizado usado no de-para (sem acento, sem prefixo, maiúsculo). */
  chave: string
  grupoCodigo: string | null
  detalhamentoCodigo: string | null
  valor: number
  /** false quando o de-para não reconheceu o macro item. */
  reconhecido: boolean
}

export interface SaldoColado {
  linhas: LinhaSaldoColada[]
  /** Soma das linhas reconhecidas + não reconhecidas. */
  total: number
  /** "Total Geral" que veio no texto, quando presente. */
  totalInformado: number | null
  /** Linhas cujo macro item o de-para não conhece — viram aviso, não erro. */
  naoReconhecidas: LinhaSaldoColada[]
  /** Linhas que não puderam ser lidas (sem valor numérico). Só para diagnóstico. */
  ignoradas: string[]
}

/** Cabeçalhos e rodapés da tabela dinâmica que não são dados. */
const LINHAS_DE_CONTROLE = [
  'ROTULOS DE LINHA',
  'ROTULO DE LINHA',
  'SOMA DE VLR. A DESC',
  'TOTAL GERAL',
  '(VAZIO)',
  'EM BRANCO',
]

/**
 * Converte "515.299,66" / "515299.66" / "(1.234,00)" em número.
 *
 * O ponto é separador de milhar no formato pt-BR do ERP; só a última vírgula
 * é decimal. Parêntese é negativo (convenção contábil do Excel).
 */
export function valorPtBr(texto: string): number | null {
  const bruto = texto.trim()
  if (!bruto) return null
  const negativo = /^\(.*\)$/.test(bruto)
  const limpo = bruto.replace(/[()]/g, '').replace(/[R$\s ]/g, '')
  if (!/\d/.test(limpo)) return null
  // Com vírgula presente, ela é o decimal e o ponto é milhar.
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : limpo
  const n = Number(normalizado)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

/**
 * Quebra uma linha em rótulo + valor. O valor é sempre o ÚLTIMO campo; o
 * rótulo é todo o resto, porque ele contém espaços e hífens.
 */
function partirLinha(linha: string): { rotulo: string; valor: number } | null {
  const texto = linha.replace(/\r/g, '').trimEnd()
  if (!texto.trim()) return null

  // TAB é o caso normal (colagem do Excel). Sem TAB, quebra na última
  // sequência de 2+ espaços — um espaço só pode estar dentro do rótulo.
  const campos = texto.includes('\t')
    ? texto.split('\t')
    : texto.split(/\s{2,}/)

  if (campos.length < 2) return null
  const valor = valorPtBr(campos[campos.length - 1])
  if (valor === null) return null
  const rotulo = campos.slice(0, -1).join(' ').trim()
  if (!rotulo) return null
  return { rotulo, valor }
}

/**
 * Lê o texto colado inteiro. Nunca lança: linha ruim vira `ignoradas`, macro
 * item desconhecido vira `naoReconhecidas`. Quem chama decide o que é erro.
 */
export function parseSaldoColado(texto: string): SaldoColado {
  const linhas: LinhaSaldoColada[] = []
  const ignoradas: string[] = []
  let totalInformado: number | null = null

  for (const bruta of String(texto ?? '').split('\n')) {
    if (!bruta.trim()) continue
    const partida = partirLinha(bruta)

    if (!partida) {
      // Cabeçalho sem valor não é problema — só some.
      const norm = normalizar(bruta)
      if (!LINHAS_DE_CONTROLE.some(c => norm.includes(c))) ignoradas.push(bruta.trim())
      continue
    }

    const normRotulo = normalizar(partida.rotulo)
    if (normRotulo.includes('TOTAL GERAL')) {
      totalInformado = partida.valor
      continue
    }
    if (LINHAS_DE_CONTROLE.some(c => normRotulo === c)) continue

    const chave = extrairMacroItem(partida.rotulo)
    const dePara = resolverDePara(chave)
    linhas.push({
      macroItem: partida.rotulo,
      chave,
      grupoCodigo: dePara.grupo ?? null,
      detalhamentoCodigo: dePara.detalhamento ?? null,
      valor: partida.valor,
      reconhecido: !!(dePara.grupo || dePara.detalhamento),
    })
  }

  const total = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100
  return {
    linhas,
    total,
    totalInformado,
    naoReconhecidas: linhas.filter(l => !l.reconhecido),
    ignoradas,
  }
}
