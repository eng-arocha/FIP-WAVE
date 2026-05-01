// lib/hooks/use-tree-expansion.ts
'use client'

import { useCallback, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const PARAM = 'expand'

export function useTreeExpansion() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const expandedIds = useMemo(() => {
    const raw = params.get(PARAM)
    if (!raw) return new Set<string>()
    return new Set(raw.split(',').filter(Boolean))
  }, [params])

  const setExpanded = useCallback(
    (next: Set<string>) => {
      const qs = new URLSearchParams(params.toString())
      if (next.size === 0) qs.delete(PARAM)
      else qs.set(PARAM, Array.from(next).join(','))
      router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  const toggle = useCallback((id: string) => {
    const next = new Set(expandedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const expand = useCallback((id: string) => {
    if (expandedIds.has(id)) return
    const next = new Set(expandedIds)
    next.add(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const collapse = useCallback((id: string) => {
    if (!expandedIds.has(id)) return
    const next = new Set(expandedIds)
    next.delete(id)
    setExpanded(next)
  }, [expandedIds, setExpanded])

  const isExpanded = useCallback((id: string) => expandedIds.has(id), [expandedIds])

  const collapseAll = useCallback(() => setExpanded(new Set()), [setExpanded])

  return { expandedIds, isExpanded, toggle, expand, collapse, collapseAll }
}
