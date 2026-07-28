/**
 * Parser do relatório "Controle FIP INFORMAKON" (xlsx exportado do ERP da FIP).
 *
 * O arquivo tem três formatos de aba, cada um com o cabeçalho numa linha
 * diferente e nomes de coluna que variam de acordo com a versão do relatório.
 * Por isso nada aqui usa índice fixo de coluna: o cabeçalho é localizado
 * procurando a primeira linha que contenha as colunas obrigatórias, e cada
 * coluna é resolvida por nome normalizado.
 *
 *   "faturamento direto global"  -> parseGlobal()          (posição de cada NF)
 *   "med 1".."med N"             -> parseMedicoes()        (desconto por medição)
 *   "medições serviço"           -> parseMedicoesServico() (fechamento da Wave)
 */

/**
 * Remove acentos, o indicador ordinal do "Nº", colapsa espaço e sobe pra
 * maiúscula. O "º" precisa sair senão "Nº Documento" nunca casa com um alvo
 * escrito "N Documento".
 */
export function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[º°]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/**
 * De-para do macro item do Informakon para o contrato FIP-WAVE.
 *
 * O Informakon guarda o macro item no texto livre da coluna Especificação
 * ("Faturamento direto - HIDRÁULICA"). Os dois itens do grupo 19 são
 * detalhamentos, não grupos macro — por isso o alvo é o código do
 * detalhamento e não o do grupo.
 */
export const DE_PARA_MACRO_ITEM: Record<string, { grupo?: string; detalhamento?: string }> = {
  'ELETRICA SUBESTACAO': { grupo: '1' },
  'GERACAO': { grupo: '2' },
  'ALIMENTACAO ELETRICA': { grupo: '3' },
  'DISTRIBUICAO ELETRICA': { grupo: '4' },
  'LUMINARIAS': { grupo: '5' },
  'QUADROS ELETRICOS': { grupo: '6' },
  'LOGICA (DADOS E VOZ) - INFRA SECA': { grupo: '7' },
  'AGUA PLUVIAL': { grupo: '8' },
  'ESGOTO': { grupo: '9' },
  'HIDRAULICA': { grupo: '10' },
  'PISCINA E SPA': { grupo: '12' },
  'LOUCAS E METAIS': { grupo: '13' },
  'COMBATE AO INCENDIO': { grupo: '14' },
  'EXTINTOR E SINALIZACAO': { grupo: '15' },
  'SISTEMA DE DETECCAO E ALARME DE INCENDIO (SDAI)': { grupo: '16' },
  'GAS': { grupo: '17' },
  'SISTEMA DE PROTECAO CONTRA DESCARGA ATMOSFERICA': { grupo: '18' },
  'ADMINISTRACAO OBRA': { detalhamento: '19.1.1' },
  'FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS': { detalhamento: '19.1.2' },
}

/**
 * Extrai o macro item do texto da Especificação, tirando o prefixo
 * "Faturamento direto -" (que aparece com um ou dois espaços, e às vezes com
 * o hífen colado). Devolve o texto normalizado.
 */
export function extrairMacroItem(especificacao: unknown): string {
  const n = normalizar(especificacao)
  const semPrefixo = n.replace(/^FATURAMENTO DIRETO\s*-\s*/, '')
  return semPrefixo.trim()
}

export function resolverDePara(macroItem: string): { grupo?: string; detalhamento?: string } {
  return DE_PARA_MACRO_ITEM[macroItem] ?? {}
}

/** Separa 'NF-e 115581' em tipo e número. O número é só os dígitos finais. */
export function parseDocumento(doc: unknown): { documento: string; tipo: string | null; numero: string | null } {
  const documento = String(doc ?? '').trim()
  if (!documento) return { documento: '', tipo: null, numero: null }
  const m = documento.match(/^(NFS-e|NF-e|NFS|NF)?\s*.*?(\d+)\s*$/i)
  const tipo = /^NFS/i.test(documento) ? 'NFS-e' : /^NF/i.test(documento) ? 'NF-e' : null
  return { documento, tipo, numero: m?.[2] ?? null }
}

/**
 * Números do Informakon chegam como number quando a célula é numérica e como
 * texto BR ("1.234,56") quando a exportação escapou pra string.
 */
export function toNumero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v).trim().replace(/[R$\s%]/g, '')
  if (!s) return 0
  const temVirgula = s.includes(',')
  const temPonto = s.includes('.')
  let norm = s
  if (temVirgula && temPonto) norm = s.replace(/\./g, '').replace(',', '.')
  else if (temVirgula) norm = s.replace(',', '.')
  const n = Number(norm)
  return Number.isFinite(n) ? n : 0
}

/** Datas vêm como Date (cellDates) ou string ISO/BR. */
export function toData(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

type Linha = unknown[]

/**
 * Localiza a linha de cabeçalho e devolve um resolvedor de coluna por nome.
 * `obrigatorias` são fragmentos normalizados que precisam estar presentes.
 */
export function acharCabecalho(
  aoa: Linha[],
  obrigatorias: string[],
  limite = 12,
): { linha: number; indice: (...nomes: string[]) => number } | null {
  for (let r = 0; r < Math.min(limite, aoa.length); r++) {
    const cells = (aoa[r] || []).map(normalizar)
    const achou = obrigatorias.every(o => cells.some(c => c.includes(o)))
    if (!achou) continue
    const indice = (...nomes: string[]) => {
      for (const nome of nomes) {
        const alvo = normalizar(nome)
        // Preferência por igualdade exata; cai para "contém" se não houver.
        const exato = cells.indexOf(alvo)
        if (exato >= 0) return exato
        const parcial = cells.findIndex(c => c.includes(alvo))
        if (parcial >= 0) return parcial
      }
      return -1
    }
    return { linha: r, indice }
  }
  return null
}

export interface NfLinha {
  entrada: string
  documento: string
  numero_nf: string | null
  tipo_doc: string | null
  pedido: string | null
  item_pedido: string | null
  macro_item: string
  grupo_codigo: string | null
  detalhamento_codigo: string | null
  valor_descontado: number
  valor_a_descontar: number
  fornecedor_codigo?: string | null
  fornecedor_nome?: string | null
  metodo_fornecedor?: MetodoFornecedor | null
}

/** Aba "faturamento direto global". */
export function parseGlobal(aoa: Linha[]): NfLinha[] {
  const cab = acharCabecalho(aoa, ['ENTRADA', 'DOCUMENTO', 'ESPECIFICACAO'])
  if (!cab) throw new Error('Aba "faturamento direto global": cabeçalho não encontrado (esperado Nº Entrada / Documento / Especificação).')
  const { indice } = cab
  const iEntrada = indice('N Entrada', 'Entrada')
  const iDoc = indice('Documento')
  const iEspec = indice('Especificacao')
  const iPedido = indice('N Pedido Centro Assoc', 'Pedido Centro', 'N Pedido Associado')
  const iItem = indice('Item')
  const iVlrDesc = indice('Vlr.Desc', 'Vlr Desc', 'Valor Descontado')
  const iVlrPend = indice('Vlr. a Desc', 'Vlr a Desc', 'Valor a Descontar')

  if (iEntrada < 0 || iDoc < 0 || iEspec < 0) {
    throw new Error('Aba "faturamento direto global": colunas obrigatórias ausentes.')
  }

  const out: NfLinha[] = []
  for (let r = cab.linha + 1; r < aoa.length; r++) {
    const row = aoa[r] || []
    const entrada = String(row[iEntrada] ?? '').trim()
    if (!entrada) continue
    const macro = extrairMacroItem(row[iEspec])
    if (!macro) continue
    const { documento, tipo, numero } = parseDocumento(row[iDoc])
    const dp = resolverDePara(macro)
    out.push({
      entrada,
      documento,
      numero_nf: numero,
      tipo_doc: tipo,
      pedido: iPedido >= 0 && row[iPedido] != null ? String(row[iPedido]).trim() : null,
      item_pedido: iItem >= 0 && row[iItem] != null ? String(row[iItem]).trim() : null,
      macro_item: macro,
      grupo_codigo: dp.grupo ?? null,
      detalhamento_codigo: dp.detalhamento ?? null,
      valor_descontado: toNumero(iVlrDesc >= 0 ? row[iVlrDesc] : 0),
      valor_a_descontar: toNumero(iVlrPend >= 0 ? row[iVlrPend] : 0),
    })
  }
  return out
}

export interface MedicaoDesconto {
  medicao_numero: number
  entrada: string
  documento: string
  numero_nf: string | null
  macro_item: string
  grupo_codigo: string | null
  detalhamento_codigo: string | null
  valor_a_descontar: number
  percentual_desc: number
  valor_descontado: number
  fornecedor_codigo?: string | null
  fornecedor_nome?: string | null
}

/** Abas "med 1".."med N". Recebe o nome da aba para extrair o número. */
export function parseMedicao(aoa: Linha[], nomeAba: string): MedicaoDesconto[] {
  const num = Number(normalizar(nomeAba).replace(/\D/g, ''))
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Aba "${nomeAba}": não foi possível extrair o número da medição.`)
  }
  const cab = acharCabecalho(aoa, ['ENTRADA', 'DOCUMENTO', 'ESPECIFICACAO'])
  if (!cab) throw new Error(`Aba "${nomeAba}": cabeçalho não encontrado.`)
  const { indice } = cab
  const iEntrada = indice('N Entrada', 'Entrada')
  const iDoc = indice('Documento')
  const iEspec = indice('Especificacao')
  const iVlrADesc = indice('Vlr.aDesc', 'Vlr. a Desc', 'Vlr aDesc')
  const iPct = indice('% Desc', 'Perc Desc')
  const iValorD = indice('Valor D', 'Valor Descontado')

  const out: MedicaoDesconto[] = []
  for (let r = cab.linha + 1; r < aoa.length; r++) {
    const row = aoa[r] || []
    const entrada = String(row[iEntrada] ?? '').trim()
    if (!entrada) continue
    const macro = extrairMacroItem(row[iEspec])
    if (!macro) continue
    const { documento, numero } = parseDocumento(row[iDoc])
    const dp = resolverDePara(macro)
    out.push({
      medicao_numero: num,
      entrada,
      documento,
      numero_nf: numero,
      macro_item: macro,
      grupo_codigo: dp.grupo ?? null,
      detalhamento_codigo: dp.detalhamento ?? null,
      valor_a_descontar: toNumero(iVlrADesc >= 0 ? row[iVlrADesc] : 0),
      percentual_desc: toNumero(iPct >= 0 ? row[iPct] : 0),
      valor_descontado: toNumero(iValorD >= 0 ? row[iValorD] : 0),
    })
  }
  return out
}

export interface MedicaoServico {
  numero_informakon: number | null
  rotulo: string | null
  medicao_numero: number | null
  data_medicao: string | null
  valor_contratual: number
  valor_material: number
  valor_liquido: number
  valor_reajuste: number
  descontos_diversos: number
  impostos_retidos: number
  retencao: number
  valor_a_pagar: number
  tipo_documento: string | null
  numero_documento: string | null
}

/** Aba "medições serviço". */
export function parseMedicoesServico(aoa: Linha[]): MedicaoServico[] {
  const cab = acharCabecalho(aoa, ['MEDICAO', 'VALOR A PAGAR'])
  if (!cab) throw new Error('Aba "medições serviço": cabeçalho não encontrado.')
  const { indice } = cab
  const iNum = indice('N Medicao', 'Medicao')
  const iData = indice('Data')
  const iObs = indice('Observacao')
  const iContratual = indice('(+) Valor Contratual M', 'Valor Contratual Medido')
  const iMaterial = indice('(-) Material Fornecido', 'Material Fornecido')
  const iLiquido = indice('Valor Contratual Liqui', 'Valor Contratual Liquido')
  const iReajuste = indice('(+) Valor do Reajuste', 'Valor do Reajuste')
  const iDiversos = indice('(-) Descontos Diversos', 'Descontos Diversos')
  const iImpostos = indice('(-) Impostos Retidos', 'Impostos Retidos')
  const iRetencao = indice('(-) Retencao', 'Retencao')
  const iPagar = indice('Valor a Pagar')
  const iTipoDoc = indice('Tipo Doc')
  const iNumDoc = indice('N Documento')

  const out: MedicaoServico[] = []
  for (let r = cab.linha + 1; r < aoa.length; r++) {
    const row = aoa[r] || []
    const numInf = toNumero(row[iNum])
    // Linhas de agrupamento ("Centro: ...") e linhas vazias não têm nº medição.
    if (!numInf) continue
    const rotulo = iObs >= 0 && row[iObs] ? String(row[iObs]).trim() : null
    const numDoc = iNumDoc >= 0 && row[iNumDoc] != null ? String(row[iNumDoc]).trim() : null
    // A observação ("MED 04") é preenchida à mão e às vezes vem vazia. O nº da
    // NFS-e emitida é sequencial por medição, então serve de fallback.
    const doRotulo = rotulo ? Number(rotulo.replace(/\D/g, '')) : NaN
    const doDoc = numDoc ? Number(numDoc.replace(/\D/g, '')) : NaN
    const medNum = Number.isFinite(doRotulo) && doRotulo > 0 ? doRotulo : doDoc
    out.push({
      numero_informakon: numInf,
      rotulo,
      medicao_numero: Number.isFinite(medNum) && medNum > 0 ? medNum : null,
      data_medicao: toData(iData >= 0 ? row[iData] : null),
      valor_contratual: toNumero(iContratual >= 0 ? row[iContratual] : 0),
      valor_material: toNumero(iMaterial >= 0 ? row[iMaterial] : 0),
      valor_liquido: toNumero(iLiquido >= 0 ? row[iLiquido] : 0),
      valor_reajuste: toNumero(iReajuste >= 0 ? row[iReajuste] : 0),
      descontos_diversos: toNumero(iDiversos >= 0 ? row[iDiversos] : 0),
      impostos_retidos: toNumero(iImpostos >= 0 ? row[iImpostos] : 0),
      retencao: toNumero(iRetencao >= 0 ? row[iRetencao] : 0),
      valor_a_pagar: toNumero(iPagar >= 0 ? row[iPagar] : 0),
      tipo_documento: iTipoDoc >= 0 && row[iTipoDoc] ? String(row[iTipoDoc]).trim() : null,
      numero_documento: numDoc,
    })
  }
  return out
}

export interface LancamentoWave {
  tipo_doc: string
  numero_documento: string
  fornecedor_codigo: string
  fornecedor_nome: string
  valor: number
}

/**
 * Aba "NFS WAVE GLOBAL": todos os lançamentos da obra (~10 mil linhas), com
 * fornecedor. O relatório de faturamento direto não traz o fornecedor, então
 * é daqui que ele sai.
 */
export function parseNfsWaveGlobal(aoa: Linha[]): LancamentoWave[] {
  const cab = acharCabecalho(aoa, ['FORNECEDOR', 'DOCUMENTO', 'VALOR'])
  if (!cab) throw new Error('Aba "NFS WAVE GLOBAL": cabeçalho não encontrado.')
  const { indice } = cab
  const iTipo = indice('TpDoc.', 'TpDoc', 'Tipo Doc')
  const iNum = indice('N Documento')
  const iCod = indice('Forn')
  const iNome = indice('Fornecedor')
  const iValor = indice('Valor')

  const out: LancamentoWave[] = []
  for (let r = cab.linha + 1; r < aoa.length; r++) {
    const row = aoa[r] || []
    const numero = row[iNum] != null ? String(row[iNum]).trim() : ''
    if (!numero) continue
    out.push({
      tipo_doc: iTipo >= 0 ? String(row[iTipo] ?? '').trim() : '',
      numero_documento: numero,
      fornecedor_codigo: iCod >= 0 ? String(row[iCod] ?? '').trim() : '',
      fornecedor_nome: iNome >= 0 ? String(row[iNome] ?? '').trim() : '',
      valor: toNumero(iValor >= 0 ? row[iValor] : 0),
    })
  }
  return out
}

/**
 * Reduz o nome do fornecedor à sua raiz, para que as várias grafias que o
 * Informakon guarda do mesmo fornecedor colapsem numa só.
 *
 * O mesmo Carmehil aparece cadastrado três vezes — "Carmehil Comercial
 * Elétrica Ltda", "CARMEHIL - COMERCIAL ELETRICA LTDA" e "... - Network" —
 * com código diferente em cada uma. Filial e matriz também têm códigos
 * distintos. Para o contrato é tudo o mesmo fornecedor.
 */
export function nomeCanonicoFornecedor(nome: string): string {
  return normalizar(nome)
    .replace(/\s*-\s*(FILIAL|MATRIZ|NETWORK)\b.*$/, '')
    .replace(/\b(LTDA|EIRELI|EPP|ME|S\/A|SA|CIA)\b/g, ' ')
    .replace(/[.,\-/&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type MetodoFornecedor = 'nome_unico' | 'valor_linha' | 'valor_agregado' | 'ambiguo'

export interface Fornecedor {
  codigo: string | null
  nome: string | null
  metodo: MetodoFornecedor
}

/**
 * Descobre o fornecedor de cada linha de NF cruzando com os lançamentos da
 * obra. A numeração de NFS-e é municipal e por prestador, então (tipo, número)
 * NÃO é único — no relatório de 28/07/2026, 30 das 181 linhas casavam com mais
 * de um fornecedor. A desambiguação é em cascata:
 *
 *   1. `nome_unico`     — todos os lançamentos com esse tipo+número são do
 *                         mesmo fornecedor. Nada a decidir.
 *   2. `valor_linha`    — o valor da linha bate com exatamente um lançamento.
 *   3. `valor_agregado` — a nota foi rateada em vários macro itens; a soma das
 *                         linhas bate com exatamente um lançamento.
 *   4. `ambiguo`        — não dá para decidir sozinho; devolve sem fornecedor
 *                         para que a tela peça confirmação humana.
 *
 * Cuidado ao mudar isto: o nome do fornecedor NÃO é chave. O mesmo grupo
 * aparece como "Carmehil Comercial Elétrica Ltda", "CARMEHIL - COMERCIAL
 * ELETRICA LTDA" e "... - Network", com códigos diferentes. O código é a chave.
 */
export function resolverFornecedores(
  nfs: NfLinha[],
  lancamentos: LancamentoWave[],
): Map<string, Fornecedor> {
  const porChave = new Map<string, LancamentoWave[]>()
  for (const l of lancamentos) {
    const k = `${l.tipo_doc}|${l.numero_documento}`
    const lista = porChave.get(k)
    if (lista) lista.push(l)
    else porChave.set(k, [l])
  }

  // Soma das linhas por documento, para o caso da nota rateada.
  const somaPorChave = new Map<string, number>()
  for (const nf of nfs) {
    const k = `${nf.tipo_doc}|${nf.numero_nf}`
    somaPorChave.set(k, (somaPorChave.get(k) ?? 0) + nf.valor_descontado + nf.valor_a_descontar)
  }

  const bate = (cands: LancamentoWave[], alvo: number) =>
    cands.filter(c => Math.abs(c.valor - alvo) < 0.05)
  // Agrupa pela raiz do nome, não pelo código: filial, matriz e as grafias
  // duplicadas do mesmo fornecedor têm códigos diferentes mas são um só.
  const unico = (cands: LancamentoWave[]): Fornecedor | null => {
    if (!cands.length) return null
    const raizes = new Set(cands.map(c => nomeCanonicoFornecedor(c.fornecedor_nome)))
    if (raizes.size !== 1) return null
    return { codigo: cands[0].fornecedor_codigo, nome: cands[0].fornecedor_nome, metodo: 'nome_unico' }
  }

  const out = new Map<string, Fornecedor>()
  for (const nf of nfs) {
    const k = `${nf.tipo_doc}|${nf.numero_nf}`
    const cands = porChave.get(k) ?? []

    const todosIguais = unico(cands)
    if (todosIguais) { out.set(nf.entrada, todosIguais) ; continue }

    const porLinha = unico(bate(cands, nf.valor_descontado + nf.valor_a_descontar))
    if (porLinha) { out.set(nf.entrada, { ...porLinha, metodo: 'valor_linha' }); continue }

    const porSoma = unico(bate(cands, somaPorChave.get(k) ?? 0))
    if (porSoma) { out.set(nf.entrada, { ...porSoma, metodo: 'valor_agregado' }); continue }

    out.set(nf.entrada, { codigo: null, nome: null, metodo: 'ambiguo' })
  }
  return out
}

export interface RelatorioInformakon {
  nfs: NfLinha[]
  descontos: MedicaoDesconto[]
  medicoesServico: MedicaoServico[]
  /** Quantas linhas ficaram sem fornecedor resolvido. */
  fornecedoresAmbiguos: number
  /** Macro itens que não estão no de-para — precisam de atenção humana. */
  macroItensDesconhecidos: string[]
  avisos: string[]
  totais: { qtd_linhas: number; total_nf: number; total_descontado: number; total_a_descontar: number }
}

/** Classifica as abas do arquivo e parseia cada uma. */
export function parseRelatorio(
  abas: { nome: string; aoa: Linha[] }[],
): RelatorioInformakon {
  const avisos: string[] = []
  let nfs: NfLinha[] = []
  const descontos: MedicaoDesconto[] = []
  let medicoesServico: MedicaoServico[] = []
  let lancamentos: LancamentoWave[] = []

  for (const { nome, aoa } of abas) {
    const n = normalizar(nome)
    try {
      if (n.includes('NFS WAVE GLOBAL')) lancamentos = parseNfsWaveGlobal(aoa)
      else if (n.includes('GLOBAL')) nfs = parseGlobal(aoa)
      else if (/^MED\s*\d+$/.test(n)) descontos.push(...parseMedicao(aoa, nome))
      else if (n.includes('MEDICOES SERVICO') || n.includes('MEDICAO SERVICO')) {
        medicoesServico = parseMedicoesServico(aoa)
      } else {
        avisos.push(`Aba "${nome}" ignorada — não corresponde a nenhum formato conhecido.`)
      }
    } catch (e) {
      avisos.push(e instanceof Error ? e.message : String(e))
    }
  }

  if (!nfs.length) {
    throw new Error('Nenhuma linha de NF encontrada. O arquivo precisa ter a aba "faturamento direto global".')
  }

  const desconhecidos = Array.from(
    new Set(
      [...nfs, ...descontos]
        .filter(l => !l.grupo_codigo && !l.detalhamento_codigo)
        .map(l => l.macro_item),
    ),
  ).sort()

  // Enriquece com o fornecedor quando a aba "NFS WAVE GLOBAL" veio junto.
  let fornecedoresAmbiguos = 0
  if (lancamentos.length) {
    const forn = resolverFornecedores(nfs, lancamentos)
    for (const nf of nfs) {
      const f = forn.get(nf.entrada)
      if (!f) continue
      nf.fornecedor_codigo = f.codigo
      nf.fornecedor_nome = f.nome
      nf.metodo_fornecedor = f.metodo
      if (f.metodo === 'ambiguo') fornecedoresAmbiguos++
    }
    // As abas "med N" referenciam a mesma entrada — herdam o fornecedor.
    const porEntrada = new Map(nfs.map(n => [n.entrada, n]))
    for (const d of descontos) {
      const nf = porEntrada.get(d.entrada)
      if (!nf) continue
      d.fornecedor_codigo = nf.fornecedor_codigo ?? null
      d.fornecedor_nome = nf.fornecedor_nome ?? null
    }
    if (fornecedoresAmbiguos) {
      avisos.push(`${fornecedoresAmbiguos} nota(s) casaram com mais de um fornecedor e ficaram sem atribuição — confirme manualmente.`)
    }
  } else {
    avisos.push('Aba "NFS WAVE GLOBAL" não encontrada — as notas ficam sem o nome do fornecedor.')
  }

  const total_descontado = nfs.reduce((s, l) => s + l.valor_descontado, 0)
  const total_a_descontar = nfs.reduce((s, l) => s + l.valor_a_descontar, 0)

  return {
    nfs,
    descontos,
    medicoesServico,
    fornecedoresAmbiguos,
    macroItensDesconhecidos: desconhecidos,
    avisos,
    totais: {
      qtd_linhas: nfs.length,
      total_nf: Math.round((total_descontado + total_a_descontar) * 100) / 100,
      total_descontado: Math.round(total_descontado * 100) / 100,
      total_a_descontar: Math.round(total_a_descontar * 100) / 100,
    },
  }
}
