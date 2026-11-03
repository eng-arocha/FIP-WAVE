// Filtro estilo Excel da Visão Geral — aplica os filtros de coluna à árvore.
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import type { ColunaVisaoGeral } from '@/components/contratos/visao-geral/colunas'
import {
  filtroAtivo, passaNoFiltro, VAZIAS,
  type CelulaFiltro, type FiltroColuna, type TipoColunaFiltro,
} from '@/lib/filtro-excel'
import { valoresPorModo, percentuais, fmtPct, type FlatRow } from './visao-geral'

export type FiltrosVisaoGeral = Partial<Record<ColunaVisaoGeral, FiltroColuna>>

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function tipoDaColuna(key: ColunaVisaoGeral): TipoColunaFiltro {
  return key === 'item' ? 'texto' : 'numero'
}

/** Valor e texto da célula, exatamente como a tabela mostra. */
export function celulaDaColuna(item: DashboardItem, modo: DashboardModo, key: ColunaVisaoGeral): CelulaFiltro {
  if (key === 'item') {
    const t = `${item.codigo} ${item.nome}`
    return { valor: t, texto: t }
  }
  if (key === 'pctMedido' || key === 'pctDescontado') {
    const p = percentuais(item)
    const n = key === 'pctDescontado' ? p.matDescontado : modo === 'material' ? p.matMedido : p.servMedido
    // Compara pelo número arredondado que aparece (1 casa), como o Excel.
    return n === null ? { valor: null, texto: VAZIAS } : { valor: Math.round(n * 10) / 10, texto: fmtPct(n) }
  }
  const v = valoresPorModo(item, modo)
  const n = key === 'contratado' ? v.contratado
    : key === 'realizado' ? v.realizado
      : key === 'saldo' ? v.saldo
        : v.pendenteNf
  return n === null ? { valor: null, texto: VAZIAS } : { valor: n, texto: fmt(n) }
}

export function algumFiltroAtivo(filtros: FiltrosVisaoGeral): boolean {
  return Object.values(filtros).some(f => filtroAtivo(f))
}

/** Campos somáveis do item — o que um grupo/tarefa agrega dos filhos. */
const CAMPOS_SOMA = [
  'valor_contratado_total', 'valor_contratado_material', 'valor_contratado_servico',
  'realizado_total', 'realizado_material', 'realizado_servico',
  'servico_em_aprovacao', 'material_medido', 'material_em_aprovacao', 'material_descontado',
  'saldo_aprovado_material', 'saldo_medicao_servico',
] as const satisfies ReadonlyArray<keyof DashboardItem>

/** Linhas do escopo (descendentes de `scopeId`), com o nível rebaseado. */
function linhasDoEscopo(rows: FlatRow[], scopeId: string | null): FlatRow[] {
  if (!scopeId) return rows
  const porId = new Map(rows.map(r => [r.item.id, r]))
  const raiz = porId.get(scopeId)
  if (!raiz) return rows
  const out: FlatRow[] = []
  for (const r of rows) {
    let pai = r.item.pai_id
    while (pai && pai !== scopeId) pai = porId.get(pai)?.item.pai_id ?? null
    if (pai === scopeId) out.push({ item: r.item, level: r.level - raiz.level - 1 })
  }
  return out
}

function passaEmTodos(
  item: DashboardItem, modo: DashboardModo, filtros: FiltrosVisaoGeral, exceto?: ColunaVisaoGeral,
): boolean {
  for (const [key, f] of Object.entries(filtros) as Array<[ColunaVisaoGeral, FiltroColuna]>) {
    if (key === exceto || !filtroAtivo(f)) continue
    if (!passaNoFiltro(f, tipoDaColuna(key), celulaDaColuna(item, modo, key))) return false
  }
  return true
}

/**
 * Aplica os filtros de coluna à árvore.
 *
 * O filtro é avaliado nos ITENS (as linhas sem filhos — os detalhamentos da
 * planilha). Grupo e tarefa entram só como contexto dos itens que passaram, e
 * mostram a SOMA DESSES itens — como o SUBTOTAL do Excel, que ignora as linhas
 * escondidas. Avaliar o filtro também no grupo misturaria níveis: "saldo > 0"
 * traria o grupo inteiro com itens zerados dentro.
 */
export function aplicarFiltrosArvore(
  rows: FlatRow[], modo: DashboardModo, filtros: FiltrosVisaoGeral, scopeId: string | null = null,
): FlatRow[] {
  const escopo = linhasDoEscopo(rows, scopeId)
  const porId = new Map(escopo.map(r => [r.item.id, r]))
  const somas = new Map<string, DashboardItem>()
  const visiveis = new Set<string>()

  for (const { item } of escopo) {
    if (item.tem_filhos || !passaEmTodos(item, modo, filtros)) continue
    visiveis.add(item.id)
    let pai = item.pai_id ? porId.get(item.pai_id)?.item : undefined
    while (pai) {
      visiveis.add(pai.id)
      let soma = somas.get(pai.id)
      if (!soma) {
        soma = { ...pai }
        for (const c of CAMPOS_SOMA) soma[c] = 0
        somas.set(pai.id, soma)
      }
      for (const c of CAMPOS_SOMA) soma[c] += Number(item[c]) || 0
      pai = pai.pai_id ? porId.get(pai.pai_id)?.item : undefined
    }
  }

  return escopo
    .filter(r => visiveis.has(r.item.id))
    .map(r => ({ item: somas.get(r.item.id) ?? r.item, level: r.level }))
}

/**
 * Valores da lista de checkboxes de uma coluna: os itens que passam nos
 * filtros das OUTRAS colunas (cascata, como no Excel), sem repetição.
 */
export function valoresDistintos(
  rows: FlatRow[], modo: DashboardModo, filtros: FiltrosVisaoGeral, key: ColunaVisaoGeral, scopeId: string | null = null,
): Array<{ texto: string; valor: number | string | null }> {
  const vistos = new Map<string, number | string | null>()
  for (const { item } of linhasDoEscopo(rows, scopeId)) {
    if (item.tem_filhos || !passaEmTodos(item, modo, filtros, key)) continue
    const c = celulaDaColuna(item, modo, key)
    if (!vistos.has(c.texto)) vistos.set(c.texto, c.valor)
  }
  const lista = [...vistos].map(([texto, valor]) => ({ texto, valor }))
  // Texto em ordem de código ("3.2.9" antes de "3.2.10"); número crescente; vazias por último.
  return lista.sort((a, b) => {
    if (a.valor === null) return b.valor === null ? 0 : 1
    if (b.valor === null) return -1
    if (typeof a.valor === 'number' && typeof b.valor === 'number') return a.valor - b.valor
    return String(a.valor).localeCompare(String(b.valor), 'pt-BR', { numeric: true })
  })
}
