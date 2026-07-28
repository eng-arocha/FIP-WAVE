// Divergências de NF entre o relatório do Informakon (ERP da FIP) e o que o
// FIP-WAVE tem lançado em `notas_fiscais_fat_direto`.
//
// Por que isto existe: hoje a comparação só é visível rodando SQL na mão
// (ver `lib/db/informakon-conciliacao.ts`, que já faz uma versão "para tela",
// limitada e sem export). O usuário quer poder mandar a lista de divergências
// pra FIP resolver, sem depender de alguém rodar consulta — daí o CSV.
//
// Lógica pura e sem I/O de propósito: fica fácil de testar e reaproveitar
// tanto na rota de API quanto, no futuro, em outro lugar (ex.: um relatório
// na tela) sem duplicar a regra de negócio.

export type SituacaoDivergencia = 'so_informakon' | 'so_sistema' | 'valor_divergente'

export interface LinhaDivergencia {
  numero_nf: string
  tipo_doc: string | null
  fornecedor_informakon: string | null
  emitente_sistema: string | null
  /** Grupos macro (ou detalhamento, para o grupo 19) em que a nota aparece no Informakon. */
  grupos: string | null
  valor_informakon: number
  valor_sistema: number
  /** informakon - sistema */
  diferenca: number
  situacao: SituacaoDivergencia
}

interface LinhaInformakon {
  numero_nf: string | null
  tipo_doc?: string | null
  fornecedor_nome?: string | null
  grupo_codigo?: string | null
  detalhamento_codigo?: string | null
  valor_descontado: number
  valor_a_descontar: number
}

interface NotaSistema {
  numero_nf: string
  emitente: string | null
  valor: number
}

/** Tolerância default: abaixo disso é arredondamento, não divergência real. */
const TOLERANCIA_PADRAO = 0.05

/** Só os dígitos — o mesmo número de NF chega formatado de jeitos diferentes nas duas fontes. */
function normalizarNumero(numero: string | null | undefined): string {
  return String(numero ?? '').replace(/\D/g, '')
}

interface AggInformakon {
  valor: number
  tipoDoc: string | null
  fornecedor: string | null
  grupos: Set<string>
}

interface AggSistema {
  valor: number
  emitente: string | null
}

/**
 * Compara as duas listas por número de nota (só os dígitos) e devolve as
 * divergências, maiores primeiro.
 *
 * - Do lado Informakon, o valor da nota é a SOMA de `valor_descontado +
 *   valor_a_descontar` de todas as linhas com aquele número (a mesma nota
 *   pode aparecer em vários macro itens).
 * - Do lado sistema, soma também (a mesma solicitação pode ter mais de uma
 *   linha de NF com o mesmo número, embora raro).
 * - Números vazios/nulos são ignorados dos dois lados.
 * - Só entra na saída quem tem |diferença| > tolerância, ou existe só de um
 *   lado.
 */
export function compararNotas(
  informakon: LinhaInformakon[],
  sistema: NotaSistema[],
  toleranciaCentavos: number = TOLERANCIA_PADRAO,
): LinhaDivergencia[] {
  const porInformakon = new Map<string, AggInformakon>()
  for (const l of informakon) {
    const numero = normalizarNumero(l.numero_nf)
    if (!numero) continue
    let agg = porInformakon.get(numero)
    if (!agg) {
      agg = { valor: 0, tipoDoc: null, fornecedor: null, grupos: new Set() }
      porInformakon.set(numero, agg)
    }
    agg.valor += Number(l.valor_descontado || 0) + Number(l.valor_a_descontar || 0)
    if (!agg.tipoDoc && l.tipo_doc) agg.tipoDoc = l.tipo_doc
    if (!agg.fornecedor && l.fornecedor_nome) agg.fornecedor = l.fornecedor_nome
    const grupo = l.detalhamento_codigo || l.grupo_codigo
    if (grupo) agg.grupos.add(grupo)
  }

  const porSistema = new Map<string, AggSistema>()
  for (const nf of sistema) {
    const numero = normalizarNumero(nf.numero_nf)
    if (!numero) continue
    let agg = porSistema.get(numero)
    if (!agg) {
      agg = { valor: 0, emitente: null }
      porSistema.set(numero, agg)
    }
    agg.valor += Number(nf.valor || 0)
    if (!agg.emitente && nf.emitente) agg.emitente = nf.emitente
  }

  const numeros = new Set<string>([...porInformakon.keys(), ...porSistema.keys()])
  const linhas: LinhaDivergencia[] = []

  for (const numero of numeros) {
    const lado1 = porInformakon.get(numero)
    const lado2 = porSistema.get(numero)
    const valorInformakon = lado1?.valor ?? 0
    const valorSistema = lado2?.valor ?? 0
    const diferenca = valorInformakon - valorSistema

    let situacao: SituacaoDivergencia
    if (!lado1) {
      situacao = 'so_sistema'
    } else if (!lado2) {
      situacao = 'so_informakon'
    } else if (Math.abs(diferenca) > toleranciaCentavos) {
      situacao = 'valor_divergente'
    } else {
      // Bate dentro da tolerância — não é divergência, não entra na saída.
      continue
    }

    linhas.push({
      numero_nf: numero,
      tipo_doc: lado1?.tipoDoc ?? null,
      fornecedor_informakon: lado1?.fornecedor ?? null,
      emitente_sistema: lado2?.emitente ?? null,
      grupos: lado1 && lado1.grupos.size > 0 ? Array.from(lado1.grupos).sort().join(', ') : null,
      valor_informakon: valorInformakon,
      valor_sistema: valorSistema,
      diferenca,
      situacao,
    })
  }

  linhas.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  return linhas
}

const SITUACAO_LABEL: Record<SituacaoDivergencia, string> = {
  so_informakon: 'Só no Informakon',
  so_sistema: 'Só no sistema',
  valor_divergente: 'Valor divergente',
}

/** Vírgula decimal, sem separador de milhar — como o Excel brasileiro espera. */
function formatarNumeroBR(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Escapa um campo para CSV com separador ';': entre aspas duplas quando o
 * campo contém ';', '"' ou quebra de linha, dobrando as aspas internas.
 */
function escaparCampo(valor: string): string {
  if (/[;"\n\r]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`
  }
  return valor
}

const CABECALHO = [
  'Número NF',
  'Tipo Documento',
  'Fornecedor (Informakon)',
  'Emitente (Sistema)',
  'Grupos',
  'Valor Informakon',
  'Valor Sistema',
  'Diferença',
  'Situação',
]

/**
 * Serializa em CSV com separador ';' (padrão brasileiro, abre direto no
 * Excel). Começa com BOM (`﻿`) — sem ele o Excel brasileiro interpreta
 * o arquivo como Latin-1 e corrompe os acentos do cabeçalho/valores.
 */
export function gerarCsvDivergencias(linhas: LinhaDivergencia[]): string {
  const BOM = '﻿'
  const linhasCsv = linhas.map(l => [
    escaparCampo(l.numero_nf),
    escaparCampo(l.tipo_doc ?? ''),
    escaparCampo(l.fornecedor_informakon ?? ''),
    escaparCampo(l.emitente_sistema ?? ''),
    escaparCampo(l.grupos ?? ''),
    formatarNumeroBR(l.valor_informakon),
    formatarNumeroBR(l.valor_sistema),
    formatarNumeroBR(l.diferenca),
    escaparCampo(SITUACAO_LABEL[l.situacao]),
  ].join(';'))

  return BOM + [CABECALHO.join(';'), ...linhasCsv].join('\r\n')
}
