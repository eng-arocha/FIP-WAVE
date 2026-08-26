/**
 * Parser da COLAGEM do saldo a descontar do Informakon.
 *
 * Dois formatos são aceitos, e o parser descobre sozinho qual chegou.
 *
 * 1) DETALHADO — uma linha por NOTA (é o que se deve usar). É a grade do ERP
 *    copiada inteira, com TAB entre as colunas:
 *
 *      Documento	Insumo	Especificação	Unidade	Qtd.a Desc	Vlr. a Desc	Qtd.Desc	Vlr.Desc
 *      NF-e 534	71635	Faturamento direto  - ELÉTRICA SUBESTAÇÃO	R$	72.780,81	72.780,81	0,00	0,00
 *      NF-e 198	71635	Faturamento direto  - ELÉTRICA SUBESTAÇÃO	R$	0,00	0,00	5.261,84	5.261,84
 *
 *    Esse formato carrega o NÚMERO DA NOTA, então a conferência deixa de ser
 *    "faltam R$ 56 mil em algum lugar" e vira "a NF-e 534 não está lançada lá".
 *    Traz também o `Vlr.Desc` — o que o ERP JÁ descontou em medições passadas.
 *
 * 2) AGREGADO — uma linha por macro item (rótulo, TAB, valor). É a tabela
 *    dinâmica somada à mão, que era o único formato aceito antes:
 *
 *      Faturamento direto  - ÁGUA PLUVIAL	375.254,16
 *      Total Geral	3.327.113,20
 *
 *    Continua funcionando: quem já cola assim não precisa mudar nada, só
 *    perde a rastreabilidade por nota.
 *
 * Nos dois casos o macro item é resolvido por `extrairMacroItem` /
 * `resolverDePara`, as MESMAS funções da importação do xlsx — se um dia o
 * Informakon renomear um macro item, os dois caminhos passam a reconhecer
 * juntos.
 */

import { extrairMacroItem, resolverDePara, normalizar, parseDocumento } from './parser'

export type FormatoSaldoColado = 'detalhado' | 'agregado'

/** Uma nota do Informakon dentro de um macro item (formato detalhado). */
export interface NotaSaldoColada {
  /** 'NF-e 534' — como veio na coluna Documento. */
  documento: string
  /** 'NF-e' | 'NFS-e' | null. */
  tipoDoc: string | null
  /** Só os dígitos: '534'. É por aqui que a nota casa com a do nosso lado. */
  numeroNf: string | null
  /** Código do insumo do ERP (71635 = faturamento direto). Só rastreabilidade. */
  insumo: string | null
  /** Rótulo do macro item exatamente como veio. */
  macroItem: string
  chave: string
  grupoCodigo: string | null
  detalhamentoCodigo: string | null
  /** Vlr. a Desc — lançado no ERP e ainda disponível para descontar. */
  valorADescontar: number
  /** Vlr.Desc — o ERP já consumiu em medição anterior. */
  valorDescontado: number
  reconhecido: boolean
}

export interface LinhaSaldoColada {
  /** Rótulo exatamente como veio — a prova do que foi informado. */
  macroItem: string
  /** Texto normalizado usado no de-para (sem acento, sem prefixo, maiúsculo). */
  chave: string
  grupoCodigo: string | null
  detalhamentoCodigo: string | null
  /** Σ "Vlr. a Desc" do macro item. */
  valor: number
  /** Σ "Vlr.Desc" do macro item. Zero no formato agregado. */
  valorDescontado: number
  /** false quando o de-para não reconheceu o macro item. */
  reconhecido: boolean
}

export interface SaldoColado {
  /** Qual layout foi reconhecido. */
  formato: FormatoSaldoColado
  linhas: LinhaSaldoColada[]
  /** Uma entrada por nota × macro item. Vazio no formato agregado. */
  notas: NotaSaldoColada[]
  /** Soma das linhas reconhecidas + não reconhecidas. */
  total: number
  /** Σ do que o ERP já descontou. Zero no formato agregado. */
  totalDescontado: number
  /** "Total Geral" do Vlr. a Desc que veio no texto, quando presente. */
  totalInformado: number | null
  /** "Total Geral" do Vlr.Desc, quando presente. */
  totalDescontadoInformado: number | null
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
  const bruto = String(texto ?? '').trim()
  if (!bruto) return null
  const negativo = /^\(.*\)$/.test(bruto)
  const limpo = bruto.replace(/[()]/g, '').replace(/[R$\s ]/g, '')
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
 * Nome de coluna sem espaço e sem ponto, para casar "Vlr. a Desc",
 * "Vlr.aDesc" e "VLR A DESC" na mesma chave sem confundir com "Vlr.Desc".
 */
function compacto(s: unknown): string {
  return normalizar(s).replace(/[\s.]/g, '')
}

/** Colunas do layout detalhado, resolvidas por nome (índice fixo não serve). */
interface ColunasDetalhado {
  doc: number
  insumo: number
  espec: number
  vlrADesc: number
  vlrDesc: number
}

/**
 * Lê o cabeçalho do layout detalhado. Só aceita quando Documento,
 * Especificação e Vlr. a Desc estão presentes — sem os três não há o que
 * conferir por nota.
 */
function lerCabecalhoDetalhado(campos: string[]): ColunasDetalhado | null {
  const acha = (...alvos: string[]) =>
    campos.findIndex(c => alvos.includes(compacto(c)))
  const doc = acha('DOCUMENTO', 'NDOCUMENTO')
  const espec = acha('ESPECIFICACAO')
  const vlrADesc = acha('VLRADESC', 'VALORADESCONTAR')
  const vlrDesc = acha('VLRDESC', 'VALORDESCONTADO')
  if (doc < 0 || espec < 0 || vlrADesc < 0) return null
  return { doc, insumo: acha('INSUMO'), espec, vlrADesc, vlrDesc }
}

/**
 * Descobre as colunas sem cabeçalho, pela forma da linha de dados.
 *
 * A grade do ERP termina em quatro números (Qtd.a Desc, Vlr. a Desc,
 * Qtd.Desc, Vlr.Desc) — a coluna "Unidade" traz "R$", que não é número e
 * fecha a cauda numérica. Com dois números só, são os dois valores.
 * Qualquer outra forma é ambígua e a linha é ignorada em vez de chutada.
 */
function inferirColunasDetalhado(campos: string[]): ColunasDetalhado | null {
  const espec = campos.findIndex(c => {
    const macro = extrairMacroItem(c)
    return !!macro && (normalizar(c).includes('FATURAMENTO DIRETO') || !!resolverDePara(macro).grupo || !!resolverDePara(macro).detalhamento)
  })
  if (espec < 1) return null
  if (!parseDocumento(campos[0]).numero) return null

  let inicioCauda = campos.length
  while (inicioCauda > espec + 1 && valorPtBr(campos[inicioCauda - 1]) !== null) inicioCauda--
  const cauda = campos.length - inicioCauda
  if (cauda === 4) return { doc: 0, insumo: espec > 1 ? 1 : -1, espec, vlrADesc: inicioCauda + 1, vlrDesc: inicioCauda + 3 }
  if (cauda === 2) return { doc: 0, insumo: espec > 1 ? 1 : -1, espec, vlrADesc: inicioCauda, vlrDesc: inicioCauda + 1 }
  return null
}

function campoTexto(campos: string[], i: number): string {
  return i >= 0 && i < campos.length ? String(campos[i] ?? '').trim() : ''
}

function campoValor(campos: string[], i: number): number {
  if (i < 0 || i >= campos.length) return 0
  return valorPtBr(campos[i]) ?? 0
}

function montarNota(campos: string[], col: ColunasDetalhado): NotaSaldoColada | null {
  const especTexto = campoTexto(campos, col.espec)
  const macro = extrairMacroItem(especTexto)
  if (!macro) return null
  const { documento, tipo, numero } = parseDocumento(campoTexto(campos, col.doc))
  if (!documento) return null
  const dePara = resolverDePara(macro)
  return {
    documento,
    tipoDoc: tipo,
    numeroNf: numero,
    insumo: campoTexto(campos, col.insumo) || null,
    macroItem: especTexto,
    chave: macro,
    grupoCodigo: dePara.grupo ?? null,
    detalhamentoCodigo: dePara.detalhamento ?? null,
    valorADescontar: campoValor(campos, col.vlrADesc),
    valorDescontado: campoValor(campos, col.vlrDesc),
    reconhecido: !!(dePara.grupo || dePara.detalhamento),
  }
}

const cent = (n: number) => Math.round(n * 100) / 100

/** Soma as notas em uma linha por macro item — o que a comparação consome. */
function agregarNotas(notas: NotaSaldoColada[]): LinhaSaldoColada[] {
  const porChave = new Map<string, LinhaSaldoColada>()
  for (const n of notas) {
    const atual = porChave.get(n.chave)
    if (atual) {
      atual.valor += n.valorADescontar
      atual.valorDescontado += n.valorDescontado
      continue
    }
    porChave.set(n.chave, {
      macroItem: n.macroItem,
      chave: n.chave,
      grupoCodigo: n.grupoCodigo,
      detalhamentoCodigo: n.detalhamentoCodigo,
      valor: n.valorADescontar,
      valorDescontado: n.valorDescontado,
      reconhecido: n.reconhecido,
    })
  }
  for (const l of porChave.values()) {
    l.valor = cent(l.valor)
    l.valorDescontado = cent(l.valorDescontado)
  }
  return [...porChave.values()]
}

/**
 * Tenta ler o texto como a grade detalhada (uma linha por nota).
 *
 * Só entra nesse caminho quando há TAB: sem TAB a coluna Especificação
 * ("Faturamento direto  - ESGOTO", com dois espaços antes do hífen) seria
 * quebrada ao meio por qualquer heurística de espaço e o macro item viraria
 * lixo. Devolve `null` quando o layout não é esse — aí o agregado assume.
 */
function tentarDetalhado(texto: string): SaldoColado | null {
  const linhas = String(texto ?? '').split('\n')
  const notas: NotaSaldoColada[] = []
  const ignoradas: string[] = []
  let col: ColunasDetalhado | null = null
  let totalInformado: number | null = null
  let totalDescontadoInformado: number | null = null

  for (const bruta of linhas) {
    const linha = bruta.replace(/\r/g, '')
    if (!linha.trim() && !linha.includes('\t')) continue
    if (!linha.includes('\t')) continue
    const campos = linha.split('\t')
    if (campos.length < 4) continue

    if (!col) {
      col = lerCabecalhoDetalhado(campos)
      if (col) continue
      col = inferirColunasDetalhado(campos)
      if (!col) continue
    }

    const doc = campoTexto(campos, col.doc)
    const rotulo = normalizar(campos.join(' '))
    // Linha de totais: vem sem documento, com os totais nas mesmas colunas.
    if (!doc || rotulo.includes('TOTAL GERAL')) {
      const t = campoValor(campos, col.vlrADesc)
      const d = campoValor(campos, col.vlrDesc)
      if (t) totalInformado = t
      if (d) totalDescontadoInformado = d
      continue
    }

    const nota = montarNota(campos, col)
    if (nota) notas.push(nota)
    else ignoradas.push(linha.trim())
  }

  if (notas.length === 0) return null

  const agregadas = agregarNotas(notas)
  return {
    formato: 'detalhado',
    linhas: agregadas,
    notas,
    total: cent(notas.reduce((s, n) => s + n.valorADescontar, 0)),
    totalDescontado: cent(notas.reduce((s, n) => s + n.valorDescontado, 0)),
    totalInformado,
    totalDescontadoInformado,
    naoReconhecidas: agregadas.filter(l => !l.reconhecido),
    ignoradas,
  }
}

/** Layout antigo: rótulo do macro item + valor, uma linha por grupo. */
function lerAgregado(texto: string): SaldoColado {
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
      valorDescontado: 0,
      reconhecido: !!(dePara.grupo || dePara.detalhamento),
    })
  }

  return {
    formato: 'agregado',
    linhas,
    notas: [],
    total: cent(linhas.reduce((s, l) => s + l.valor, 0)),
    totalDescontado: 0,
    totalInformado,
    totalDescontadoInformado: null,
    naoReconhecidas: linhas.filter(l => !l.reconhecido),
    ignoradas,
  }
}

/**
 * Lê o texto colado inteiro. Nunca lança: linha ruim vira `ignoradas`, macro
 * item desconhecido vira `naoReconhecidas`. Quem chama decide o que é erro.
 *
 * O layout detalhado tem precedência — quando ele é reconhecido, o agregado
 * nem é tentado, porque as duas leituras produziriam o mesmo total e só a
 * detalhada sabe de qual nota veio.
 */
export function parseSaldoColado(texto: string): SaldoColado {
  return tentarDetalhado(texto) ?? lerAgregado(texto)
}
