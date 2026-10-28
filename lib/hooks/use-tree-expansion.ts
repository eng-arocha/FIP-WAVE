// lib/hooks/use-tree-expansion.ts
'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const PARAM = 'expand'
/** Exceções recolhidas quando `expand=all`. */
const PARAM_RECOLHIDOS = 'recolher'
const TODOS = 'all'

/**
 * Estado de expansão da árvore, guardado na URL.
 *
 * Dois modos:
 *   - lista explícita: `expand=id1,id2` (o que o usuário abriu à mão);
 *   - tudo aberto:     `expand=all` + `recolher=idX` (o que ele fechou depois).
 * O modo "tudo" existe pra não jogar centenas de UUIDs na URL ao clicar em
 * "Expandir tudo".
 */
export function useTreeExpansion() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const raw = params.get(PARAM)
  const todos = raw === TODOS

  const expandedIds = useMemo(() => {
    if (!raw || raw === TODOS) return new Set<string>()
    return new Set(raw.split(',').filter(Boolean))
  }, [raw])

  const recolhidos = useMemo(() => {
    const r = params.get(PARAM_RECOLHIDOS)
    return new Set(r ? r.split(',').filter(Boolean) : [])
  }, [params])

  const gravar = useCallback(
    (expand: string | null, recolher: Set<string> | null) => {
      const qs = new URLSearchParams(params.toString())
      if (!expand) qs.delete(PARAM)
      else qs.set(PARAM, expand)
      if (!recolher || recolher.size === 0) qs.delete(PARAM_RECOLHIDOS)
      else qs.set(PARAM_RECOLHIDOS, Array.from(recolher).join(','))
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const setExpanded = useCallback(
    (next: Set<string>) => gravar(next.size === 0 ? null : Array.from(next).join(','), null),
    [gravar],
  )

  const isExpanded = useCallback(
    (id: string) => (todos ? !recolhidos.has(id) : expandedIds.has(id)),
    [todos, recolhidos, expandedIds],
  )

  const toggle = useCallback((id: string) => {
    if (todos) {
      const next = new Set(recolhidos)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      gravar(TODOS, next)
      return
    }
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }, [todos, recolhidos, expandedIds, gravar, setExpanded])

  const expandAll = useCallback(() => gravar(TODOS, null), [gravar])
  const collapseAll = useCallback(() => gravar(null, null), [gravar])

  return { expandedIds, todos, isExpanded, toggle, expandAll, collapseAll }
}
