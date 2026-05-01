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

/**
 * IMPORTANTE: cache e loading são *state* (não ref). Isso é o que faz `getCached`
 * e `isLoading` mudarem de referência quando os dados chegam, garantindo que
 * useMemo/useEffect dos consumers recomputem. Refs espelho são usadas só para
 * acesso síncrono dentro de fetchChildren (evita stale closure).
 */
export function useDashboardTreeData(
  contratoId: string,
  modo: string,
  rootScope: string | null = null,
) {
  const [cache, setCache] = useState<ChildrenCache>(() => new Map())
  const [loadingMap, setLoadingMap] = useState<LoadingMap>(() => new Map())

  const cacheRef = useRef(cache)
  const loadingRef = useRef(loadingMap)
  useEffect(() => { cacheRef.current = cache }, [cache])
  useEffect(() => { loadingRef.current = loadingMap }, [loadingMap])

  const setCacheKey = useCallback((k: string | 'root', itens: DashboardItem[]) => {
    setCache(prev => {
      const next = new Map(prev)
      next.set(k, itens)
      return next
    })
  }, [])

  const setLoadingKey = useCallback((k: string | 'root', v: boolean) => {
    setLoadingMap(prev => {
      const next = new Map(prev)
      if (v) next.set(k, true)
      else next.delete(k)
      return next
    })
  }, [])

  const fetchChildren = useCallback(async (scopeId: string | null): Promise<DashboardItem[]> => {
    const k = keyFor(scopeId)
    if (cacheRef.current.has(k)) return cacheRef.current.get(k)!
    if (loadingRef.current.get(k)) return []
    setLoadingKey(k, true)
    try {
      const url = new URL(`/api/contratos/${contratoId}/dashboard`, window.location.origin)
      url.searchParams.set('modo', modo)
      url.searchParams.set('scope', scopeId ?? '')
      const res = await fetch(url.toString(), { cache: 'no-store' })
      if (!res.ok) throw new Error(`dashboard fetch ${res.status}`)
      const data = await res.json()
      const itens: DashboardItem[] = data.itens ?? []
      setCacheKey(k, itens)
      return itens
    } catch (e) {
      console.error('[useDashboardTreeData] fetch error', e)
      setCacheKey(k, [])
      return []
    } finally {
      setLoadingKey(k, false)
    }
  }, [contratoId, modo, setCacheKey, setLoadingKey])

  const isLoading = useCallback((scopeId: string | null) => {
    return loadingMap.get(keyFor(scopeId)) === true
  }, [loadingMap])

  const getCached = useCallback((scopeId: string | null) => {
    return cache.get(keyFor(scopeId))
  }, [cache])

  const invalidate = useCallback(() => {
    setCache(new Map())
    setLoadingMap(new Map())
  }, [])

  // Carga inicial robusta: faz fetch INLINE com cancellation guard.
  useEffect(() => {
    setCache(new Map())
    setLoadingMap(new Map())

    let cancelled = false
    const k = keyFor(rootScope)
    setLoadingKey(k, true)

    ;(async () => {
      try {
        const url = new URL(`/api/contratos/${contratoId}/dashboard`, window.location.origin)
        url.searchParams.set('modo', modo)
        url.searchParams.set('scope', rootScope ?? '')
        const res = await fetch(url.toString(), { cache: 'no-store' })
        if (!res.ok) throw new Error(`dashboard fetch ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        setCacheKey(k, data.itens ?? [])
      } catch (e) {
        if (!cancelled) {
          console.error('[useDashboardTreeData] init fetch error', e)
          setCacheKey(k, [])
        }
      } finally {
        if (!cancelled) setLoadingKey(k, false)
      }
    })()

    return () => { cancelled = true }
  }, [contratoId, modo, rootScope, setCacheKey, setLoadingKey])

  return { fetchChildren, isLoading, getCached, invalidate }
}
