// components/contratos/visao-geral/dashboard-tree.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { useTreeExpansion } from '@/lib/hooks/use-tree-expansion'
import { useDashboardTreeData } from '@/lib/hooks/use-dashboard-tree-data'
import { useTableLayout, type ColumnDef } from '@/lib/hooks/use-table-layout'
import { valoresPorModo, rotuloSaldo, rotuloPendenteNf, totalizarRows } from '@/lib/export/visao-geral'
import { DashboardTreeRow } from './dashboard-tree-row'
import { DashboardBarChart } from './dashboard-bar-chart'

type Props = {
  contratoId: string
  modo: DashboardModo
}

type FlatItem = { item: DashboardItem; level: number }

const DOUBLE_CLICK_GUARD_MS = 250

type ColunaVisaoGeral = 'item' | 'contratado' | 'realizado' | 'saldo' | 'pendente'

const COLUNAS_BASE: Array<ColumnDef<ColunaVisaoGeral> & { label: string }> = [
  { key: 'item', label: 'Item', defaultWidth: 420, min: 160, max: 1200, type: 'string' },
  { key: 'contratado', label: 'Contratado', defaultWidth: 140, min: 90, type: 'number' },
  { key: 'realizado', label: 'Realizado', defaultWidth: 140, min: 90, type: 'number' },
  { key: 'saldo', label: 'Saldo', defaultWidth: 140, min: 90, type: 'number' },
]
// Só em Material/Serviço — rótulo vem de rotuloPendenteNf().
const COLUNA_PENDENTE: ColumnDef<ColunaVisaoGeral> & { label: string } =
  { key: 'pendente', label: 'Pendente NF', defaultWidth: 140, min: 90, type: 'number' }
const COLUNAS_COM_PENDENTE = [...COLUNAS_BASE, COLUNA_PENDENTE]

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DashboardTree({ contratoId, modo }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const pendLabel = rotuloPendenteNf(modo)
  const colunas = pendLabel ? COLUNAS_COM_PENDENTE : COLUNAS_BASE
  const { gridTemplateColumns, startResize, reset: resetLayout } =
    useTableLayout<ColunaVisaoGeral>('contrato:visao-geral:v2', colunas)

  const scopeRaw = params.get('scope')
  const rootScope = scopeRaw === null || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw

  const { expandedIds, todos, isExpanded, toggle, expandAll, collapseAll } = useTreeExpansion()
  const { fetchChildren, isLoading, getCached, carregarTudo, carregandoTudo } =
    useDashboardTreeData(contratoId, modo, rootScope)

  // Carregar filhos de nós expandidos
  useEffect(() => {
    if (todos) return
    expandedIds.forEach(id => {
      if (!getCached(id)) fetchChildren(id)
    })
  }, [todos, expandedIds, fetchChildren, getCached])

  // "Expandir tudo": uma única carga da árvore inteira. Dispara de novo só se
  // o cache foi zerado (troca de modo/scope) e a raiz já chegou.
  const faltaFilho = useMemo(() => {
    const raiz = getCached(rootScope)
    if (!todos || !raiz) return false
    return raiz.some(i => i.tem_filhos && !getCached(i.id))
  }, [todos, getCached, rootScope])
  useEffect(() => {
    if (faltaFilho && !carregandoTudo) carregarTudo()
  }, [faltaFilho, carregandoTudo, carregarTudo])

  // Achatar árvore visível (a partir do rootScope, não de null)
  const flat = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = []
    const root = getCached(rootScope) ?? []

    function walk(items: DashboardItem[], level: number) {
      for (const item of items) {
        out.push({ item, level })
        if (item.tem_filhos && isExpanded(item.id)) {
          const children = getCached(item.id) ?? []
          walk(children, level + 1)
        }
      }
    }
    walk(root, 0)
    return out
  }, [isExpanded, getCached, rootScope])

  // Subtotal do que está na tela. totalizarRows soma só as raízes do
  // conjunto — grupo aberto não conta de novo as tarefas dele.
  const totais = useMemo(() => totalizarRows(flat, modo), [flat, modo])

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
    qs.delete('recolher')
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
      <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface-1)]">
        <div className="flex items-center justify-between gap-2 px-2 py-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAll}
              disabled={carregandoTudo}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[var(--text-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
              title="Abrir todos os grupos e tarefas"
            >
              {carregandoTudo
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <ChevronsUpDown className="w-3 h-3" />}
              Expandir tudo
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded text-[var(--text-2)] hover:bg-[var(--surface-2)]"
              title="Fechar todos os níveis"
            >
              <ChevronsDownUp className="w-3 h-3" />
              Recolher tudo
            </button>
          </div>
          <button
            type="button"
            onClick={resetLayout}
            className="text-[10px] px-1.5 py-0.5 rounded text-[var(--text-3)] hover:bg-[var(--surface-2)]"
            title="Voltar as colunas à largura padrão"
          >
            Resetar colunas
          </button>
        </div>
        {/* Header + corpo + rodapé compartilham o mesmo overflow-x pra rolarem juntos */}
        <div className="overflow-x-auto">
          <div
            className="grid items-center gap-2 px-2 py-1.5 text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border)] bg-[var(--surface-2)] sticky top-0 z-10"
            style={{ gridTemplateColumns, minWidth: 'max-content' }}
          >
            {colunas.map((col, i) => (
              <div
                key={col.key}
                className={`relative ${i === 0 ? '' : 'text-right'}`}
                title={col.key === 'saldo'
                  ? 'Contratado − Realizado'
                  : col.key === 'pendente'
                    ? (modo === 'servico' ? 'Medição aprovada ainda sem NF de serviço' : 'Pedido aprovado ainda sem NF')
                    : undefined}
              >
                {col.key === 'saldo' ? rotuloSaldo(modo) : col.key === 'pendente' ? pendLabel : col.label}
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
                  onClickPendente={(v.pendenteNf ?? 0) > 0 ? () => goToOrigem(item, 'saldo') : undefined}
                />
              )
            })}
          </div>
          {flat.length > 0 && (
            <div
              className="grid items-center gap-2 px-2 py-2 border-t-2 border-[var(--border)] bg-[var(--surface-2)] text-sm font-semibold tabular-nums"
              style={{ gridTemplateColumns, minWidth: 'max-content' }}
            >
              <div className="text-[11px] uppercase text-[var(--text-2)]">
                {rootScope ? 'Subtotal do subgrupo' : 'Subtotal'}
              </div>
              <div className="text-right text-[var(--text-1)]">{fmt(totais.contratado)}</div>
              <div className="text-right text-[var(--text-1)]">{fmt(totais.realizado)}</div>
              <div className="text-right" style={{ color: totais.saldo < 0 ? '#EF4444' : 'var(--text-1)' }}>
                {fmt(totais.saldo)}
              </div>
              {pendLabel && <div className="text-right text-[var(--text-1)]">{fmt(totais.pendenteNf)}</div>}
            </div>
          )}
        </div>
      </div>
      {/* Gráfico abaixo da tabela: a tabela é a fonte de leitura e precisa da largura toda. */}
      <div className="border border-[var(--border)] rounded-md p-2 bg-[var(--surface-1)] overflow-x-auto max-h-[70vh] overflow-y-auto">
        <DashboardBarChart
          itens={flat}
          modo={modo}
          onDoubleClickItem={onDoubleClickFromChart}
          onClickRealizado={(item) => goToOrigem(item, 'realizado')}
        />
      </div>
    </div>
  )
}
