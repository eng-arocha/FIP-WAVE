/**
 * Filtro de coluna no estilo do AutoFiltro do Excel — lógica pura, sem React.
 *
 * Cada coluna combina duas coisas, como no Excel:
 *   - a lista de valores marcados (checkboxes; `null` = todos passam);
 *   - uma condição ("maior que", "contém", "entre"…), opcional.
 * A linha passa se passar nas duas. Colunas diferentes combinam por E.
 *
 * Os valores da lista são comparados pelo TEXTO EXIBIDO na célula
 * ("1.234,56", "52,3%"), que é o que o usuário vê e marca. As condições
 * numéricas comparam o número.
 *
 * UI: components/ui/filtro-excel.tsx.
 */

export type OpNumero = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
export type OpTexto = 'contains' | 'notContains' | 'eq' | 'ne' | 'startsWith' | 'endsWith'

export interface CondicaoFiltro {
  op: OpNumero | OpTexto
  /** Como o usuário digitou — "1.234,56", "50%", "tipo". */
  valor: string
  /** Só para "entre". */
  valor2?: string
}

export interface FiltroColuna {
  /** Textos exibidos marcados. `null` = todos (sem filtro de lista). */
  selecionados: string[] | null
  condicao: CondicaoFiltro | null
}

export type TipoColunaFiltro = 'numero' | 'texto'

/** Rótulo mostrado no item da lista quando a célula está vazia (—). */
export const VAZIAS = '(Vazias)'

export const OPS_NUMERO: Array<{ op: OpNumero; label: string }> = [
  { op: 'eq', label: 'É igual a' },
  { op: 'ne', label: 'É diferente de' },
  { op: 'gt', label: 'É maior que' },
  { op: 'gte', label: 'É maior ou igual a' },
  { op: 'lt', label: 'É menor que' },
  { op: 'lte', label: 'É menor ou igual a' },
  { op: 'between', label: 'Está entre' },
]

export const OPS_TEXTO: Array<{ op: OpTexto; label: string }> = [
  { op: 'contains', label: 'Contém' },
  { op: 'notContains', label: 'Não contém' },
  { op: 'eq', label: 'É igual a' },
  { op: 'ne', label: 'É diferente de' },
  { op: 'startsWith', label: 'Começa com' },
  { op: 'endsWith', label: 'Termina com' },
]

/**
 * Lê número escrito em pt-BR ("1.234,56", "-50", "52,3%", "R$ 10") ou com
 * ponto decimal ("1234.56"). Devolve null se não houver número.
 */
export function parseNumeroBR(s: string): number | null {
  let t = (s || '').replace(/[R$\s%]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** Minúsculas e sem acento — "Elétrica" casa com "eletrica". */
export function normalizarTexto(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Tolerância das comparações numéricas: meio centavo / 0,05 p.p. */
const EPS = 0.005

function avaliarNumero(c: CondicaoFiltro, n: number | null): boolean {
  const a = parseNumeroBR(c.valor)
  if (a === null) return true // condição incompleta não filtra
  if (n === null) return c.op === 'ne'
  switch (c.op as OpNumero) {
    case 'eq': return Math.abs(n - a) < EPS
    case 'ne': return Math.abs(n - a) >= EPS
    case 'gt': return n > a + EPS
    case 'gte': return n > a - EPS
    case 'lt': return n < a - EPS
    case 'lte': return n < a + EPS
    case 'between': {
      const b = parseNumeroBR(c.valor2 ?? '')
      if (b === null) return n > a - EPS
      const [lo, hi] = a <= b ? [a, b] : [b, a]
      return n > lo - EPS && n < hi + EPS
    }
    default: return true
  }
}

function avaliarTexto(c: CondicaoFiltro, s: string): boolean {
  const alvo = normalizarTexto(c.valor)
  if (!alvo) return true
  const t = normalizarTexto(s)
  switch (c.op as OpTexto) {
    case 'contains': return t.includes(alvo)
    case 'notContains': return !t.includes(alvo)
    case 'eq': return t === alvo
    case 'ne': return t !== alvo
    case 'startsWith': return t.startsWith(alvo)
    case 'endsWith': return t.endsWith(alvo)
    default: return true
  }
}

/** A célula é o par (valor bruto, texto exibido). */
export interface CelulaFiltro {
  valor: number | string | null
  texto: string
}

export function filtroAtivo(f: FiltroColuna | undefined | null): boolean {
  if (!f) return false
  if (f.selecionados !== null) return true
  if (!f.condicao) return false
  return f.condicao.valor.trim() !== ''
}

export function passaNoFiltro(f: FiltroColuna | undefined | null, tipo: TipoColunaFiltro, cel: CelulaFiltro): boolean {
  if (!f) return true
  if (f.selecionados !== null && !f.selecionados.includes(cel.texto)) return false
  if (f.condicao) {
    if (tipo === 'numero') {
      const n = typeof cel.valor === 'number' ? cel.valor : null
      if (!avaliarNumero(f.condicao, n)) return false
    } else if (!avaliarTexto(f.condicao, String(cel.valor ?? cel.texto))) {
      return false
    }
  }
  return true
}

/** "É maior que 0", "Contém tipo" — para o resumo do filtro ativo. */
export function descreverFiltro(f: FiltroColuna, tipo: TipoColunaFiltro): string {
  const partes: string[] = []
  if (f.condicao && f.condicao.valor.trim() !== '') {
    const ops = tipo === 'numero' ? OPS_NUMERO : OPS_TEXTO
    const label = ops.find(o => o.op === f.condicao!.op)?.label ?? ''
    partes.push(f.condicao.op === 'between'
      ? `${label} ${f.condicao.valor} e ${f.condicao.valor2 ?? ''}`
      : `${label} ${f.condicao.valor}`)
  }
  if (f.selecionados !== null) {
    partes.push(f.selecionados.length === 1 ? `= ${f.selecionados[0]}` : `${f.selecionados.length} valores`)
  }
  return partes.join(' · ')
}
