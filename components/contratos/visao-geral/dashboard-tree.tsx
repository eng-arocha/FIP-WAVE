// components/contratos/visao-geral/dashboard-tree.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, Clock, Info, Loader2 } from 'lucide-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { useTreeExpansion } from '@/lib/hooks/use-tree-expansion'
import { useDashboardTreeData } from '@/lib/hooks/use-dashboard-tree-data'
import { useTableLayout } from '@/lib/hooks/use-table-layout'
import { valoresPorModo, totalizarRows, percentuais, fmtPct } from '@/lib/export/visao-geral'
import { DashboardTreeRow, PctMedido, PctRealizadoMaterial, PctDescontado } from './dashboard-tree-row'
import { colunasDoModo, COR_EM_APROVACAO, COR_FIP_ATRASADA, COR_SEM_LASTRO, COR_MAT_ADIANTADO, type ColunaVisaoGeral } from './colunas'
import { DashboardBarChart } from './dashboard-bar-chart'

export type MedicaoEmAprovacao = { numero: number; status: string }

type Props = {
  contratoId: string
  modo: DashboardModo
  /** Medições submetidas/em análise/autorizadas — nomeadas no aviso do "% Medido". */
  medicoesEmAprovacao?: MedicaoEmAprovacao[]
}

type FlatItem = { item: DashboardItem; level: number }

const DOUBLE_CLICK_GUARD_MS = 250

const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function DashboardTree({ contratoId, modo, medicoesEmAprovacao = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const colunas = colunasDoModo(modo)
  // Chave por modo: cada modo tem seu conjunto de colunas e larguras.
  const { gridTemplateColumns, startResize, reset: resetLayout } =
    useTableLayout<ColunaVisaoGeral>(`contrato:visao-geral:v4:${modo}`, colunas)

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
  const mostraPct = modo !== 'total'
  const algumEmAprovacao = mostraPct && totais.pct.servEmAprovacao > 0.0001
  const algumaFipAtrasada = modo === 'material' && flat.some(({ item }) => percentuais(item).fipAtrasada)
  const algumSemLastro = modo === 'material' && flat.some(({ item }) => percentuais(item).pendenteSemLastro > 0.005)
  const algumAdiantado = modo === 'material' && flat.some(({ item }) => {
    const p = percentuais(item)
    return p.matAdiantado && !p.matAcimaContrato
  })

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
      {(algumEmAprovacao || algumaFipAtrasada || algumSemLastro || algumAdiantado) && (
        <div className="flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-2)]">
          {algumEmAprovacao && (
            <p className="flex items-start gap-1.5">
              <Clock className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: COR_EM_APROVACAO }} />
              <span>
                O <b>% {modo === 'material' ? 'serv. medido' : 'medido'}</b> já considera{' '}
                {medicoesEmAprovacao.length > 0
                  ? medicoesEmAprovacao
                      .map(m => `a Medição nº ${String(m.numero).padStart(2, '0')} (${m.status})`)
                      .join(', ')
                  : 'medição'}
                {' '}— ainda não aprovada. Valores em{' '}
                <span style={{ color: COR_EM_APROVACAO, fontWeight: 600 }}>azul</span> têm parte do % vinda dela
                {' '}({fmtPct(totais.pct.servEmAprovacao)} do serviço{rootScope ? ' deste subgrupo' : ' do contrato'}).
                Realizado e Saldo contam só medição aprovada.
              </span>
            </p>
          )}
          {algumaFipAtrasada && (
            <p className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: COR_FIP_ATRASADA }} />
              <span>
                Realizado em <span style={{ color: COR_FIP_ATRASADA, fontWeight: 600 }}>laranja</span>: o material
                faturado (entre parênteses) está atrás do serviço medido — a FIP precisa faturar.
                Passe o mouse sobre o % para ver quanto.
              </span>
            </p>
          )}
          {algumAdiantado && (
            <p className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: COR_MAT_ADIANTADO }} />
              <span>
                % do realizado em <span style={{ color: COR_MAT_ADIANTADO, fontWeight: 600 }}>verde-azulado</span>: o
                material faturado está à frente do serviço medido. Se o físico já andou, há serviço a medir —
                é o que libera o faturamento da Wave.
              </span>
            </p>
          )}
          {algumSemLastro && (
            <p className="flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-px shrink-0" style={{ color: COR_SEM_LASTRO }} />
              <span>
                <b>% Mat. desc.</b> em <span style={{ color: COR_SEM_LASTRO, fontWeight: 600 }}>roxo</span>: parte do
                material medido ainda não foi descontado da Wave (falta lastro no ERP). Desconta sozinho na
                medição em que a nota entrar. Passe o mouse para ver quanto.
              </span>
            </p>
          )}
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
                title={col.dica}
              >
                {col.label}
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
              {colunas.slice(1).map(col => {
                switch (col.key) {
                  case 'contratado':
                    return <div key={col.key} className="text-right text-[var(--text-1)]">{fmt(totais.contratado)}</div>
                  case 'realizado':
                    return (
                      <div key={col.key} className="text-right text-[var(--text-1)] whitespace-nowrap">
                        <span style={modo === 'material' && totais.pct.fipAtrasada ? { color: COR_FIP_ATRASADA } : undefined}>
                          {fmt(totais.realizado)}
                        </span>
                        {modo === 'material' && <PctRealizadoMaterial p={totais.pct} />}
                      </div>
                    )
                  case 'pctMedido':
                    return <div key={col.key} className="text-right"><PctMedido p={totais.pct} /></div>
                  case 'pctDescontado':
                    return <div key={col.key} className="text-right"><PctDescontado p={totais.pct} /></div>
                  case 'saldo':
                    return (
                      <div key={col.key} className="text-right" style={{ color: totais.saldo < 0 ? '#EF4444' : 'var(--text-1)' }}>
                        {fmt(totais.saldo)}
                      </div>
                    )
                  case 'pendente':
                    return <div key={col.key} className="text-right text-[var(--text-1)]">{fmt(totais.pendenteNf)}</div>
                  default:
                    return null
                }
              })}
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
