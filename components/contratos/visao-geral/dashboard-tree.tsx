// components/contratos/visao-geral/dashboard-tree.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { useTreeExpansion } from '@/lib/hooks/use-tree-expansion'
import { useDashboardTreeData } from '@/lib/hooks/use-dashboard-tree-data'
import { DashboardTreeRow } from './dashboard-tree-row'
import { DashboardBarChart } from './dashboard-bar-chart'

type Props = {
  contratoId: string
  modo: DashboardModo
}

type FlatItem = { item: DashboardItem; level: number }

const DOUBLE_CLICK_GUARD_MS = 250

export function DashboardTree({ contratoId, modo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

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
            className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--surface-2)] text-[var(--accent-1)]"
          >
            <ArrowLeft className="w-3 h-3" /> Voltar a todos
          </button>
          <span>·</span>
          <span>Foco em um subgrupo</span>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-[var(--border-1)] rounded-md overflow-hidden bg-[var(--surface-1)]">
          <div className="grid grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr] items-center gap-2 px-2 py-1.5 text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border-1)] bg-[var(--surface-2)]">
            <div>Item</div>
            <div className="text-right">Contratado</div>
            <div className="text-right">Realizado</div>
            <div className="text-right">{modo === 'material' ? 'Saldo aprov.' : modo === 'servico' ? 'Saldo med.' : 'Saldo'}</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {flat.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--text-3)]">Carregando…</div>
            ) : flat.map(({ item, level }) => {
              const realizadoVal =
                modo === 'material' ? item.realizado_material
                : modo === 'servico' ? item.realizado_servico
                : item.realizado_total
              const saldoVal =
                modo === 'material' ? item.saldo_aprovado_material
                : modo === 'servico' ? item.saldo_medicao_servico
                // Total: saldo = quanto ainda falta executar do contratado
                // (Contratado − Realizado). Informativo (não abre origem).
                : Math.max(0, item.valor_contratado_total - item.realizado_total)
              return (
                <DashboardTreeRow
                  key={`${item.id}-${level}`}
                  item={item}
                  level={level}
                  expanded={isExpanded(item.id)}
                  loading={isLoading(item.id)}
                  modo={modo}
                  onToggle={() => onToggle(item)}
                  onZoom={() => onZoom(item)}
                  onClickRealizado={realizadoVal > 0 ? () => goToOrigem(item, 'realizado') : undefined}
                  onClickSaldo={modo !== 'total' && saldoVal > 0 ? () => goToOrigem(item, 'saldo') : undefined}
                />
              )
            })}
          </div>
        </div>
        <div className="border border-[var(--border-1)] rounded-md p-2 bg-[var(--surface-1)] overflow-x-auto">
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
