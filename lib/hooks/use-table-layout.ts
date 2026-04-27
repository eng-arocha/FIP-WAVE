'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type SortDir = 'asc' | 'desc' | null

export interface ColumnDef<K extends string = string> {
  key: K
  /** Largura default em px. */
  defaultWidth: number
  /** Limite mínimo (default 60). */
  min?: number
  /** Limite máximo (default 800). */
  max?: number
  /** Se true, fica fora do resize/sort (ex.: coluna de ações). */
  fixed?: boolean
  /** Tipo do dado pra ordenação correta. */
  type?: 'string' | 'number' | 'date'
}

interface PersistedState {
  widths: Record<string, number>
  sortKey: string | null
  sortDir: SortDir
}

interface UseTableLayoutResult<K extends string> {
  widths: Record<K, number>
  sortKey: K | null
  sortDir: SortDir
  /** String pronta pra `gridTemplateColumns`, com sufixo opcional pra colunas de ação. */
  gridTemplateColumns: string
  /** Click no header alterna none → asc → desc → none. */
  toggleSort: (key: K) => void
  /** Mouse-down na borda direita do header inicia o resize. */
  startResize: (key: K, e: React.MouseEvent) => void
  /** Volta tudo aos defaults (e limpa o storage). */
  reset: () => void
  /** Comparador estável usado no sort. */
  compare: (a: any, b: any, key: K) => number
}

/**
 * Hook genérico de layout de tabela: largura por coluna (com drag-resize) +
 * ordenação por coluna (asc/desc/none) + persistência em localStorage por
 * `storageKey`.
 *
 * Uso:
 *   const { widths, gridTemplateColumns, toggleSort, sortKey, sortDir, startResize, reset } =
 *     useTableLayout('aprovacoes:historico', columns)
 */
export function useTableLayout<K extends string>(
  storageKey: string,
  columns: ColumnDef<K>[],
  trailingTemplate?: string,
): UseTableLayoutResult<K> {
  const defaults = useMemo<Record<K, number>>(() => {
    const acc = {} as Record<K, number>
    for (const c of columns) acc[c.key] = c.defaultWidth
    return acc
  }, [columns])

  const colByKey = useMemo(() => {
    const m = new Map<K, ColumnDef<K>>()
    for (const c of columns) m.set(c.key, c)
    return m
  }, [columns])

  const [widths, setWidths] = useState<Record<K, number>>(defaults)
  const [sortKey, setSortKey] = useState<K | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const hydrated = useRef(false)

  // Hidrata do localStorage uma vez no client
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState
        if (parsed.widths) {
          // Aplica só as keys conhecidas — colunas removidas não criam lixo
          const merged = { ...defaults }
          for (const c of columns) {
            const v = parsed.widths[c.key]
            if (typeof v === 'number' && Number.isFinite(v)) merged[c.key] = v
          }
          setWidths(merged)
        }
        if (parsed.sortKey && colByKey.has(parsed.sortKey as K)) {
          setSortKey(parsed.sortKey as K)
          setSortDir(parsed.sortDir ?? null)
        }
      }
    } catch {/* ignore corrupted storage */}
    hydrated.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Persiste mudanças
  useEffect(() => {
    if (!hydrated.current || typeof window === 'undefined') return
    try {
      const payload: PersistedState = { widths: widths as any, sortKey, sortDir }
      localStorage.setItem(storageKey, JSON.stringify(payload))
    } catch {/* quota or disabled */}
  }, [storageKey, widths, sortKey, sortDir])

  const toggleSort = useCallback((key: K) => {
    const def = colByKey.get(key)
    if (!def || def.fixed) return
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    // mesma coluna: asc → desc → none (limpa coluna também)
    if (sortDir === 'asc') {
      setSortDir('desc')
    } else if (sortDir === 'desc') {
      setSortKey(null)
      setSortDir(null)
    } else {
      setSortDir('asc')
    }
  }, [colByKey, sortKey, sortDir])

  const startResize = useCallback((key: K, e: React.MouseEvent) => {
    const def = colByKey.get(key)
    if (!def || def.fixed) return
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = widths[key] ?? def.defaultWidth
    const min = def.min ?? 60
    const max = def.max ?? 800

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const next = Math.min(max, Math.max(min, startW + delta))
      setWidths(prev => ({ ...prev, [key]: next }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [widths, colByKey])

  const reset = useCallback(() => {
    setWidths(defaults)
    setSortKey(null)
    setSortDir(null)
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(storageKey) } catch {/* ignore */}
    }
  }, [defaults, storageKey])

  const gridTemplateColumns = useMemo(() => {
    const parts = columns.map(c => `${widths[c.key] ?? c.defaultWidth}px`)
    return trailingTemplate ? `${parts.join(' ')} ${trailingTemplate}` : parts.join(' ')
  }, [columns, widths, trailingTemplate])

  const compare = useCallback((a: any, b: any, key: K): number => {
    const def = colByKey.get(key)
    const type = def?.type ?? 'string'
    const av = a?.[key]
    const bv = b?.[key]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (type === 'number') return (Number(av) || 0) - (Number(bv) || 0)
    if (type === 'date')   return String(av).localeCompare(String(bv))
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' })
  }, [colByKey])

  return { widths, sortKey, sortDir, gridTemplateColumns, toggleSort, startResize, reset, compare }
}
