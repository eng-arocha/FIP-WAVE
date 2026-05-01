// lib/hooks/use-dashboard-tree-data.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DashboardItem } from '@/types/dashboard'

type ChildrenCache = Map<string | 'root', DashboardItem[]>
type LoadingMap = Map<string | 'root', boolean>

const ROOT_KEY = 'root' as const

function keyFor(scopeId: string | null): string | 'root' {
  return scopeId === null ? ROOT_KEY : scopeId
}

export function useDashboardTreeData(
  contratoId: string,
  modo: string,
  rootScope: string | null = null,
) {
  const cacheRef = useRef<ChildrenCache>(new Map())
  const loadingRef = useRef<LoadingMap>(new Map())
  const [, force] = useState(0)

  const fetchChildren = useCallback(async (scopeId: string | null): Promise<DashboardItem[]> => {
    const k = keyFor(scopeId)
    if (cacheRef.current.has(k)) return cacheRef.current.get(k)!
    if (loadingRef.current.get(k)) return []
    loadingRef.current.set(k, true)
    force(n => n + 1)
    try {
      const url = new URL(`/api/contratos/${contratoId}/dashboard`, window.location.origin)
      url.searchParams.set('modo', modo)
      url.searchParams.set('scope', scopeId ?? '')
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`dashboard fetch ${res.status}`)
      const data = await res.json()
      const itens: DashboardItem[] = data.itens ?? []
      cacheRef.current.set(k, itens)
      return itens
    } catch (e) {
      console.error('[useDashboardTreeData] fetch error', e)
      cacheRef.current.set(k, [])
      return []
    } finally {
      loadingRef.current.delete(k)
      force(n => n + 1)
    }
  }, [contratoId, modo])

  const isLoading = useCallback((scopeId: string | null) => {
    return loadingRef.current.get(keyFor(scopeId)) === true
  }, [])

  const getCached = useCallback((scopeId: string | null) => {
    return cacheRef.current.get(keyFor(scopeId))
  }, [])

  const invalidate = useCallback(() => {
    cacheRef.current.clear()
    loadingRef.current.clear()
    force(n => n + 1)
  }, [])

  // Carga inicial robusta: faz fetch INLINE com cancellation guard.
  // NOT depending on fetchChildren/invalidate evita race em strict mode + hydration.
  useEffect(() => {
    cacheRef.current.clear()
    loadingRef.current.clear()
    force(n => n + 1)

    let cancelled = false
    const k = keyFor(rootScope)
    loadingRef.current.set(k, true)
    force(n => n + 1)

    ;(async () => {
      try {
        const url = new URL(`/api/contratos/${contratoId}/dashboard`, window.location.origin)
        url.searchParams.set('modo', modo)
        url.searchParams.set('scope', rootScope ?? '')
        const res = await fetch(url.toString(), { cache: 'no-store' })
        if (!res.ok) throw new Error(`dashboard fetch ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        cacheRef.current.set(k, data.itens ?? [])
      } catch (e) {
        if (!cancelled) {
          console.error('[useDashboardTreeData] init fetch error', e)
          cacheRef.current.set(k, [])
        }
      } finally {
        loadingRef.current.delete(k)
        if (!cancelled) force(n => n + 1)
      }
    })()

    return () => { cancelled = true }
  }, [contratoId, modo, rootScope])

  return { fetchChildren, isLoading, getCached, invalidate }
}
