/**
 * Parser de NFe (Nota Fiscal Eletrônica) brasileira.
 *
 * Estratégia em camadas:
 *   1. Se o input é XML da NFe, parseia direto com o parser nativo
 *      (sem dep externa — só XML válido com structure conhecida).
 *   2. Se é só a chave de acesso (44 dígitos), consulta BrasilAPI
 *      pra obter os dados.
 *   3. Em ambos os casos, normaliza pra mesma interface
 *      ParsedNFe (emitente, destinatário, valor total, itens, datas, CFOP).
 *
 * Por que não usar `node-nfe` ou similar:
 *   - Pacotes de NFe trazem 500KB+ de dependências (xml2js, validators).
 *   - 90% dos casos são "tirar emitente + valor + chave do XML" — coisa
 *     que dá pra fazer com regex + parser leve.
 *   - BrasilAPI cobre o caso "só chave" sem precisar do XML.
 */

import { rateLimit, clientIp } from '@/lib/api/rate-limit'

export interface ParsedNFeItem {
  numero: number
  descricao: string
  cfop: string
  ncm?: string
  quantidade: number
  unidade: string
  valor_unitario: number
  valor_total: number
}

export interface ParsedNFe {
  /** Chave de acesso de 44 dígitos. */
  chave: string
  numero_nf: string
  serie: string
  data_emissao: string  // ISO YYYY-MM-DD
  emitente: {
    cnpj: string
    razao_social: string
    nome_fantasia?: string
    municipio?: string
    uf?: string
  }
  destinatario: {
    cnpj?: string
    cpf?: string
    razao_social: string
  }
  valor_total: number
  /** Sempre que disponível — XML costuma ter, BrasilAPI nem sempre. */
  itens?: ParsedNFeItem[]
  /** CFOP predominante (do primeiro item ou da NF). */
  cfop?: string
  /** Se veio de XML ou de consulta API. */
  source: 'xml' | 'brasilapi'
  /** Aviso quando dados parciais. */
  warnings?: string[]
}

// ─── Helpers de parsing XML ──────────────────────────────────────────

function digits(s: string): string {
  return (s || '').replace(/\D/g, '')
}

/** Extrai conteúdo da primeira tag <name> encontrada (não recursivo robusto, mas suficiente pra NFe). */
function tagContent(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].trim() : undefined
}

/** Lista de blocos de uma tag repetida. */
function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'gi')
  const out: string[] = []
  let m
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

function parseNumber(s: string | undefined): number {
  if (!s) return 0
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Parser direto de XML NFe v4.0 (Sefaz padrão atual).
 * Não valida assinatura — só extrai dados pra o app.
 */
export function parseNFeXml(xml: string): ParsedNFe {
  if (!xml || typeof xml !== 'string') {
    throw new Error('XML vazio ou inválido.')
  }
  const warnings: string[] = []

  // Chave de acesso (atributo Id da tag infNFe="NFe35200..." — 44 chars depois do "NFe")
  let chave = ''
  const idMatch = xml.match(/Id\s*=\s*["']NFe(\d{44})["']/)
  if (idMatch) chave = idMatch[1]
  else warnings.push('Chave NFe não encontrada no XML.')

  // Identificação
  const ide = tagContent(xml, 'ide') || ''
  const numero_nf = tagContent(ide, 'nNF') || ''
  const serie = tagContent(ide, 'serie') || ''
  const dhEmi = tagContent(ide, 'dhEmi') || tagContent(ide, 'dEmi') || ''
  const data_emissao = dhEmi.slice(0, 10)

  // Emitente
  const emit = tagContent(xml, 'emit') || ''
  const emitente = {
    cnpj: digits(tagContent(emit, 'CNPJ') || ''),
    razao_social: tagContent(emit, 'xNome') || '',
    nome_fantasia: tagContent(emit, 'xFant'),
    municipio: tagContent(tagContent(emit, 'enderEmit') || '', 'xMun'),
    uf: tagContent(tagContent(emit, 'enderEmit') || '', 'UF'),
  }

  // Destinatário
  const dest = tagContent(xml, 'dest') || ''
  const destinatario = {
    cnpj: digits(tagContent(dest, 'CNPJ') || ''),
    cpf: digits(tagContent(dest, 'CPF') || ''),
    razao_social: tagContent(dest, 'xNome') || '',
  }

  // Valor total
  const total = tagContent(xml, 'total') || ''
  const icmsTot = tagContent(total, 'ICMSTot') || ''
  const valor_total = parseNumber(tagContent(icmsTot, 'vNF'))

  // Itens (det blocks)
  const detBlocks = tagBlocks(xml, 'det')
  const itens: ParsedNFeItem[] = detBlocks.map((det, i) => {
    const prod = tagContent(det, 'prod') || ''
    const numAttr = det.match(/nItem\s*=\s*["'](\d+)["']/)
    return {
      numero: numAttr ? Number(numAttr[1]) : i + 1,
      descricao: tagContent(prod, 'xProd') || '',
      cfop: tagContent(prod, 'CFOP') || '',
      ncm: tagContent(prod, 'NCM'),
      quantidade: parseNumber(tagContent(prod, 'qCom')),
      unidade: tagContent(prod, 'uCom') || 'UN',
      valor_unitario: parseNumber(tagContent(prod, 'vUnCom')),
      valor_total: parseNumber(tagContent(prod, 'vProd')),
    }
  })

  return {
    chave,
    numero_nf,
    serie,
    data_emissao,
    emitente,
    destinatario,
    valor_total,
    itens,
    cfop: itens[0]?.cfop,
    source: 'xml',
    warnings: warnings.length ? warnings : undefined,
  }
}

/**
 * Consulta NFe via chave de acesso na BrasilAPI.
 * Endpoint público gratuito — sem precisar de certificado.
 *
 * Limitações da BrasilAPI:
 *  - Nem toda NFe está disponível (depende do serviço Sefaz).
 *  - Não retorna itens detalhados sempre.
 */
export async function fetchNFeByChave(chave: string): Promise<ParsedNFe> {
  const c = digits(chave)
  if (c.length !== 44) {
    throw new Error('Chave de acesso deve ter 44 dígitos.')
  }
  // Endpoint atual da BrasilAPI pra NFe
  const res = await fetch(`https://brasilapi.com.br/api/nfe/v1/${c}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 86400 }, // cache 24h
  })
  if (res.status === 404) throw new Error('NFe não encontrada na consulta pública.')
  if (!res.ok) throw new Error(`Falha na consulta NFe (status ${res.status}).`)
  const data: any = await res.json()

  return {
    chave: c,
    numero_nf: String(data.nNF ?? data.numero ?? ''),
    serie: String(data.serie ?? ''),
    data_emissao: String(data.dhEmi ?? data.data_emissao ?? '').slice(0, 10),
    emitente: {
      cnpj: digits(data.emit?.CNPJ ?? data.cnpj_emitente ?? ''),
      razao_social: data.emit?.xNome ?? data.razao_social_emitente ?? '',
      municipio: data.emit?.enderEmit?.xMun,
      uf: data.emit?.enderEmit?.UF,
    },
    destinatario: {
      cnpj: digits(data.dest?.CNPJ ?? ''),
      cpf: digits(data.dest?.CPF ?? ''),
      razao_social: data.dest?.xNome ?? '',
    },
    valor_total: parseNumber(String(data.total?.ICMSTot?.vNF ?? data.valor_total ?? 0)),
    source: 'brasilapi',
    warnings: ['Dados via consulta pública — verificar com NFe original.'],
  }
}

/**
 * Detecta automaticamente o tipo do input e parseia.
 * Aceita XML completo, ou só chave de 44 dígitos.
 */
export async function parseNFe(input: string): Promise<ParsedNFe> {
  const trimmed = input.trim()
  if (trimmed.startsWith('<')) {
    return parseNFeXml(trimmed)
  }
  const c = digits(trimmed)
  if (c.length === 44) {
    return await fetchNFeByChave(c)
  }
  throw new Error('Input não reconhecido — envie XML da NFe ou chave de 44 dígitos.')
}

/** Wrapper com rate-limit por IP — usado nos route handlers públicos. */
export async function parseNFeWithRateLimit(input: string, req: Request): Promise<ParsedNFe> {
  const ip = clientIp(req)
  const limit = rateLimit({ key: `nfe:${ip}`, max: 30, windowMs: 60_000 })
  if (!limit.ok) {
    throw Object.assign(new Error('Muitas consultas. Aguarde alguns segundos.'), {
      code: 'RATE_LIMIT', retryAfterSec: limit.retryAfterSec,
    })
  }
  return await parseNFe(input)
}
