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
  /**
   * 'Nº Entrada' do ERP — '158969/001'. Identifica a LINHA da grade, não a
   * nota: a mesma NF rateada em dois itens do pedido vem em duas entradas
   * diferentes. É a chave que distingue rateio legítimo de linha repetida.
   */
  entrada: string | null
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
  /**
   * Linhas idênticas descartadas — a mesma grade colada duas vezes.
   *
   * Acontece: seleciona-se a planilha, cola, e o conteúdo entra duplicado. O
   * estrago é silencioso onde mais dói. O total por macro item sobrevive,
   * porque o reendereçamento pela nossa alocação limita cada nota ao que ela
   * de fato cobre; mas a conferência NOTA A NOTA soma as linhas cruas, e aí
   * toda nota aparece com o dobro do valor — 196 divergências onde havia 13.
   */
  duplicadas: number
  /**
   * `Vlr.Desc` saiu idêntico a `Vlr. a Desc` em TODAS as notas.
   *
   * Fisicamente impossível: as duas colunas são o que falta descontar e o que
   * o ERP já consumiu. Iguais ao centavo significa que a colagem trouxe a
   * mesma coluna duas vezes.
   *
   * A causa, medida em produção: a seleção terminou em `Vlr. a Desc`, sem o
   * par `Qtd.Desc | Vlr.Desc`. Sobraram dois números na cauda
   * (`Qtd.a Desc | Vlr. a Desc`) e `inferirColunasDetalhado` os leu como
   * (a descontar, descontado) — mas NESTE ERP a coluna `Qtd.a Desc` carrega
   * VALOR EM R$, com 4 decimais. É o mesmo número duas vezes, e a prova fica
   * no centavo: Σ da coluna de 4 decimais deu 3.842.945,25 contra
   * 3.842.945,24 da de 2 decimais.
   *
   * O estrago é grande e silencioso: a conferência nota a nota soma
   * `a descontar + descontado` para achar quanto a nota vale no ERP, e com a
   * cópia toda nota passa a valer o dobro. Foram 196 divergências onde havia
   * 13, todas com o "lá" exatamente 2× o "aqui".
   *
   * Quando isso acontece, `valorDescontado` é descartado — zero é ignorância
   * honesta, a cópia é uma afirmação falsa que contamina toda comparação.
   */
  colunasColapsadas: boolean
  /**
   * A colagem é a grade detalhada do ERP, mas chegou SEM TABULAÇÃO.
   *
   * Acontece quando o texto passa por um campo que come o TAB (colar de um
   * PDF, de um e-mail, do WhatsApp, ou copiar da tela em vez do Excel). Sem
   * TAB não há coluna: `Documento`, `Especificação` e os quatro números viram
   * uma única frase, a leitura detalhada não acha coluna nenhuma e o layout
   * agregado assume — aí cada LINHA DE DADOS inteira passa a ser lida como se
   * fosse o rótulo de um macro item, com o último número como valor.
   *
   * O resultado é um retrato inútil que ainda por cima SUBSTITUI o anterior,
   * que era bom. Por isso quem chama deve recusar a colagem, não salvá-la.
   */
  tabulacaoPerdida: boolean
  /**
   * A colagem não trouxe a coluna `Vlr.Desc` — o que o ERP JÁ descontou.
   *
   * Acontece quando a seleção termina em `Vlr. a Desc`. O teto de lastro (o
   * que falta descontar) continua correto, então o retrato vale; o que se
   * perde é saber QUAIS notas o ERP já consumiu. Vira aviso, não erro: melhor
   * um retrato com o "já descontado" desconhecido (zero) do que um com ele
   * inventado pela cópia da coluna vizinha.
   */
  semColunaDescontado: boolean
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
  /** 'Nº Entrada'. -1 quando a colagem veio sem cabeçalho. */
  entrada: number
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
  return {
    doc, insumo: acha('INSUMO'), espec, vlrADesc, vlrDesc,
    entrada: acha('NENTRADA', 'ENTRADA', 'NOENTRADA'),
  }
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
  const insumo = espec > 1 ? 1 : -1
  if (cauda === 4) return { doc: 0, insumo, espec, vlrADesc: inicioCauda + 1, vlrDesc: inicioCauda + 3, entrada: -1 }
  if (cauda === 2) {
    // Dois números podem ser duas coisas MUITO diferentes:
    //
    //   `Qtd.a Desc | Vlr. a Desc` → o MESMO valor duas vezes (a seleção
    //      parou antes do par Qtd.Desc/Vlr.Desc). Reconhecível pelas casas:
    //      4 decimais na coluna Qtd., 2 na Vlr., e valor idêntico.
    //   `Vlr. a Desc | Vlr.Desc`   → os dois valores de fato, com as colunas
    //      Qtd. escondidas.
    //
    // Ler o primeiro caso como o segundo foi o que produziu, em produção, 187
    // notas com as duas colunas iguais e 196 divergências falsas de valor. Na
    // dúvida entre inventar o "já descontado" e admitir que não veio, admite.
    const a = campos[inicioCauda]
    const b = campos[inicioCauda + 1]
    const parQtdVlr = casasDecimais(a) === 4 && casasDecimais(b) <= 2
      && valorPtBr(a) === valorPtBr(b)
    return parQtdVlr
      ? { doc: 0, insumo, espec, vlrADesc: inicioCauda + 1, vlrDesc: -1, entrada: -1 }
      : { doc: 0, insumo, espec, vlrADesc: inicioCauda, vlrDesc: inicioCauda + 1, entrada: -1 }
  }
  return null
}

/**
 * Casas decimais do texto. Quatro é a assinatura de uma coluna `Qtd.` do
 * Informakon — que neste ERP carrega VALOR em R$, não quantidade.
 */
function casasDecimais(texto: unknown): number {
  const m = String(texto ?? '').trim().match(/,(\d+)$/)
  return m ? m[1].length : 0
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
    entrada: campoTexto(campos, col.entrada) || null,
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
  /** Chaves de linha já vistas — ver `duplicadas` em SaldoColado. */
  const vistas = new Set<string>()
  let duplicadas = 0
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
    if (!nota) { ignoradas.push(linha.trim()); continue }
    // Chave da LINHA da grade. O 'Nº Entrada' é o identificador do ERP e
    // distingue rateio legítimo (mesma NF, entradas diferentes) de linha
    // repetida. Sem ele — colagem sem cabeçalho — cai no conjunto de campos
    // que define a linha, que é conservador na direção certa: linha
    // realmente igual não acrescenta informação nenhuma.
    const chaveLinha = nota.entrada
      ? `E:${nota.entrada}`
      : `D:${nota.documento}|${nota.chave}|${nota.valorADescontar}|${nota.valorDescontado}`
    if (vistas.has(chaveLinha)) { duplicadas++; continue }
    vistas.add(chaveLinha)
    notas.push(nota)
  }

  if (notas.length === 0) return null

  // `Vlr.Desc` igual a `Vlr. a Desc` é colagem defeituosa, não dado. Ver
  // `colunasColapsadas`.
  //
  // Exigir unanimidade não serviu: no retrato real 187 de 248 notas vieram
  // idênticas e as outras 61 estavam zeradas dos DOIS lados — nota que o ERP
  // já consumiu inteira, que na colagem sem a coluna `Vlr.Desc` não tem valor
  // nenhum para mostrar. Uma única nota zerada fazia o `every` passar e a
  // trava dormir.
  //
  // Então o teste é a PROPORÇÃO entre as notas que têm algum valor: nota com
  // saldo a descontar normalmente tem `Vlr.Desc` zero, e nota já consumida tem
  // `Vlr. a Desc` zero. Iguais e não-zero ao centavo é quase impossível uma
  // vez; ser a maioria é cópia de coluna, não coincidência.
  const comValor = notas.filter(n => n.valorADescontar !== 0 || n.valorDescontado !== 0)
  const iguais = comValor.filter(n => n.valorADescontar === n.valorDescontado)
  const colunasColapsadas = comValor.length >= 4
    && iguais.length / comValor.length >= 0.6
  if (colunasColapsadas) for (const n of notas) n.valorDescontado = 0

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
    duplicadas,
    colunasColapsadas,
    tabulacaoPerdida: false,
    // Sem a coluna, `valorDescontado` é zero por ignorância, não por dado.
    semColunaDescontado: !!col && col.vlrDesc < 0,
  }
}

/**
 * Reconhece uma LINHA DE DADOS da grade detalhada que perdeu as tabulações.
 *
 * Três marcas juntas, que a tabela dinâmica somada nunca tem ao mesmo tempo:
 * o rótulo do macro item ("Faturamento direto - ..."), um documento
 * ("NF-e 198") e uma cauda de dois ou mais números (Qtd./Vlr. a Desc,
 * Qtd./Vlr.Desc). Ver `tabulacaoPerdida`.
 */
function pareceGradeSemTab(linha: string): boolean {
  if (linha.includes('\t')) return false
  const norm = normalizar(linha)
  if (!norm.includes('FATURAMENTO DIRETO')) return false
  if (!/\bNFS?-?E?\s*\d/.test(norm)) return false
  const campos = linha.trim().split(/\s+/)
  let numeros = 0
  for (let i = campos.length - 1; i >= 0 && valorPtBr(campos[i]) !== null; i--) numeros++
  return numeros >= 2
}

/**
 * Quantas linhas parecem grade detalhada sem TAB. Exige um punhado antes de
 * acusar, para que uma observação solta colada junto não derrube a colagem.
 */
function contarGradeSemTab(texto: string): number {
  let n = 0
  for (const linha of String(texto ?? '').split('\n')) if (pareceGradeSemTab(linha)) n++
  return n
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
    // O layout agregado não tem nota; não há linha para repetir.
    duplicadas: 0,
    colunasColapsadas: false,
    tabulacaoPerdida: false,
    // O layout agregado nunca traz o "já descontado"; avisar seria ruído.
    semColunaDescontado: false,
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
  const detalhado = tentarDetalhado(texto)
  if (detalhado) return detalhado
  const agregado = lerAgregado(texto)
  // Cair no agregado por FALTA DE TAB não é "outro layout", é colagem
  // estragada. Marca para que quem chama recuse, em vez de gravar lixo sobre
  // o retrato bom. Ver `tabulacaoPerdida`.
  agregado.tabulacaoPerdida = contarGradeSemTab(texto) >= 3
  return agregado
}
