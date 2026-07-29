// components/contratos/visao-geral/dashboard-tree.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { useTreeExpansion } from '@/lib/hooks/use-tree-expansion'
import { useDashboardTreeData } from '@/lib/hooks/use-dashboard-tree-data'
import { useTableLayout, type ColumnDef } from '@/lib/hooks/use-table-layout'
import { valoresPorModo, rotuloSaldo } from '@/lib/export/visao-geral'
import { DashboardTreeRow } from './dashboard-tree-row'
import { DashboardBarChart } from './dashboard-bar-chart'

type Props = {
  contratoId: string
  modo: DashboardModo
}

type FlatItem = { item: DashboardItem; level: number }

const DOUBLE_CLICK_GUARD_MS = 250

type ColunaVisaoGeral = 'item' | 'contratado' | 'realizado' | 'saldo'

const COLUNAS_VISAO_GERAL: Array<ColumnDef<ColunaVisaoGeral> & { label: string }> = [
  { key: 'item', label: 'Item', defaultWidth: 280, min: 160, max: 900, type: 'string' },
  { key: 'contratado', label: 'Contratado', defaultWidth: 130, min: 90, type: 'number' },
  { key: 'realizado', label: 'Realizado', defaultWidth: 130, min: 90, type: 'number' },
  // O rótulo desta muda com o modo — ver rotuloSaldo().
  { key: 'saldo', label: 'Saldo', defaultWidth: 130, min: 90, type: 'number' },
]

export function DashboardTree({ contratoId, modo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const { gridTemplateColumns, startResize, reset: resetLayout } =
    useTableLayout<ColunaVisaoGeral>('contrato:visao-geral:v1', COLUNAS_VISAO_GERAL)

  const scopeRaw = params.get('scope')
  const rootScope = scopeRaw === null || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw

  const { expandedIds, isExpanded, toggle } = useTreeExpansion()
  const { fetchChildren, isLoading, getCached } = useDashboardTreeData(contratoId, modo, rootScope)

  // Carregar filhos de nós expandidos
  useEffect(() => {
    expandedIds.forEach(id => {
      if (!getCached(id)) fetchChildren(id)
    })
  }, [expandedIds, fetchChildren, getCached])

  // Achatar árvore visível (a partir do rootScope, não de null)
  const flat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = []
    const root = getCached(rootScope) ?? []

    function walk(items: DashboardItem[], level: number) {
      for (const item of items) {
        out.push({ item, level })
        if (item.tem_filhos && expandedIds.has(item.id)) {
          const children = getCached(item.id) ?? []
          walk(children, level + 1)
        }
      }
    }
    walk(root, 0)
    return out
  }, [expandedIds, getCached, rootScope])

  const lastClickRef = useRef<{ id: string; t: number } | null>(null)

  const onToggle = useCallback((item: DashboardItem) => {
    if (!item.tem_filhos) return
    if (!getCached(item.id)) fetchChildren(item.id)
    toggle(item.id)
  }, [fetchChildren, getCached, toggle])

  const updateScope = useCallback((newScope: string | null) => {
    const qs = new URLSearchParams(params.toString())
    if (newScope === null) qs.delete('scope')
    else qs.set('scope', newScope)
    qs.delete('expand')
    router.replace(`${pathname}?${qs.toString()}`, { scroll: false })
  }, [params, pathname, router])

  const onZoom = useCallback((item: DashboardItem) => {
    updateScope(item.id)
  }, [updateScope])

  const goToOrigem = useCallback((item: DashboardItem, origem: 'realizado' | 'saldo') => {
    const now = Date.now()
    const last = lastClickRef.current
    if (last && last.id === item.id && now - last.t < DOUBLE_CLICK_GUARD_MS) {
      lastClickRef.current = null
      return
    }
    lastClickRef.current = { id: item.id, t: now }

    setTimeout(() => {
      const cur = lastClickRef.current
      if (!cur || cur.id !== item.id || cur.t !== now) return
      const url = new URL(`/contratos/${contratoId}/origem`, window.location.origin)
      url.searchParams.set('modo', modo)
      url.searchParams.set('origem', origem)
      url.searchParams.set('scope', item.id)
      const from = `${pathname}?${params.toString()}`
      url.searchParams.set('from', from)
      router.push(url.pathname + url.search)
    }, DOUBLE_CLICK_GUARD_MS)
  }, [contratoId, modo, pathname, params, router])

  const onDoubleClickFromChart = useCallback((item: DashboardItem) => {
    // Duplo-clique no chart = zoom (consistente com tabela)
    onZoom(item)
  }, [onZoom])

  return (
    <div className="flex flex-col gap-2" role="tree">
      {rootScope && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-3)]">
          <button
            type="button"
            onClick={() => updateScope(null)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-2)] text-[var(--accent)]"
          >
            <ArrowLeft className="w-3 h-3" /> Voltar a todos
          </button>
          <span>·</span>
          <span>Foco em um subgrupo</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface-1)]">
          <div className="flex items-center justify-end px-2 py-1">
            <button
              type="button"
              onClick={resetLayout}
              className="text-[10px] px-1.5 py-0.5 rounded text-[var(--text-3)] hover:bg-[var(--surface-2)]"
              title="Voltar as colunas à largura padrão"
            >
              Resetar colunas
            </button>
          </div>
          {/* Header + corpo compartilham o mesmo overflow-x pra rolarem juntos */}
          <div className="overflow-x-auto">
            <div
              className="grid items-center gap-2 px-2 py-1.5 text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--surface-2)] sticky top-0 z-10"
              style={{ gridTemplateColumns, minWidth: 'max-content' }}
            >
              {COLUNAS_VISAO_GERAL.map((col, i) => (
                <div
                  key={col.key}
                  className={`relative ${i === 0 ? '' : 'text-right'}`}
                >
                  {col.key === 'saldo' ? rotuloSaldo(modo) : col.label}
                  <span
                    onMouseDown={e => startResize(col.key, e)}
                    onClick={e => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
                    style={{ background: 'transparent' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    title="Arraste para redimensionar"
                  />
                </div>
              ))}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {flat.length === 0 ? (
                <div className="p-6 text-center text-sm text-[var(--text-3)]">Carregando…</div>
              ) : flat.map(({ item, level }) => {
                const v = valoresPorModo(item, modo)
                return (
                  <DashboardTreeRow
                    key={`${item.id}-${level}`}
                    item={item}
                    level={level}
                    expanded={isExpanded(item.id)}
                    loading={isLoading(item.id)}
                    modo={modo}
                    gridTemplateColumns={gridTemplateColumns}
                    onToggle={() => onToggle(item)}
                    onZoom={() => onZoom(item)}
                    onClickRealizado={v.realizado > 0 ? () => goToOrigem(item, 'realizado') : undefined}
                    onClickSaldo={modo !== 'total' && v.saldo > 0 ? () => goToOrigem(item, 'saldo') : undefined}
                  />
                )
              })}
            </div>
          </div>
        </div>
        <div className="border border-[var(--border)] rounded-md p-2 bg-[var(--surface-1)] overflow-x-auto">
          <DashboardBarChart
            itens={flat}
            modo={modo}
            onDoubleClickItem={onDoubleClickFromChart}
            onClickRealizado={(item) => goToOrigem(item, 'realizado')}
            onClickSaldo={(item) => goToOrigem(item, 'saldo')}
          />
        </div>
      </div>
    </div>
  )
}
