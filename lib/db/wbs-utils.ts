// lib/db/wbs-utils.ts

/**
 * Comparador numérico hierárquico de códigos WBS: '10.2' vs '2.10' ordena
 * primeiro pelo primeiro segmento (10 > 2), depois pelo segundo, etc.
 * Segmentos faltantes são tratados como 0 (assim '1' < '1.1').
 *
 * Ordenação de texto (`localeCompare`, `ORDER BY codigo` no Postgres) coloca
 * '1.10.1' antes de '1.2.1' e '10.1.1' antes de '2.1.1' — a lista fica
 * ilegível justamente onde o usuário procura um item pelo número.
 */
export function compareCodigo(a: string, b: string): number {
  const partsA = String(a ?? '').split('.').map(s => Number(s) || 0)
  const partsB = String(b ?? '').split('.').map(s => Number(s) || 0)
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0
    const vb = partsB[i] ?? 0
    if (va !== vb) return va - vb
  }
  return 0
}

export type WbsNode = {
  id: string
  pai_id: string | null
  nivel: 1 | 2 | 3
}

/**
 * Dado um scopeId (qualquer nível) ou null, retorna o conjunto de IDs
 * de todos os DETALHAMENTOS (nível 3) descendentes desse escopo.
 * Se scopeId for null, retorna todos os detalhamentos.
 * Se scopeId for um detalhamento, retorna apenas { scopeId }.
 */
export function descendantDetalhamentoIds(
  scopeId: string | null,
  nodes: WbsNode[],
): Set<string> {
  const all = nodes
  const detalhamentos = all.filter(n => n.nivel === 3)

  if (scopeId === null) {
    return new Set(detalhamentos.map(d => d.id))
  }

  const scope = all.find(n => n.id === scopeId)
  if (!scope) return new Set()

  if (scope.nivel === 3) return new Set([scopeId])

  // BFS para coletar descendentes
  const out = new Set<string>()
  const queue = [scopeId]
  const childrenByPai = new Map<string, WbsNode[]>()
  for (const n of all) {
    if (n.pai_id) {
      const arr = childrenByPai.get(n.pai_id) ?? []
      arr.push(n)
      childrenByPai.set(n.pai_id, arr)
    }
  }
  while (queue.length) {
    const cur = queue.shift()!
    const children = childrenByPai.get(cur) ?? []
    for (const c of children) {
      if (c.nivel === 3) out.add(c.id)
      else queue.push(c.id)
    }
  }
  return out
}

/**
 * Resolve o scope (qualquer nível) para metadata exibível.
 */
export function resolveScopeInfo(
  scopeId: string | null,
  nodes: Array<WbsNode & { codigo: string; nome: string }>,
): { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null {
  if (scopeId === null) {
    return { id: null, codigo: '', nome: 'Todos os grupos', nivel: null }
  }
  const n = nodes.find(x => x.id === scopeId)
  if (!n) return null
  return { id: n.id, codigo: n.codigo, nome: n.nome, nivel: n.nivel }
}
