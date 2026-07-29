// components/contratos/visao-geral/dashboard-tree-row.tsx
'use client'

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { memo } from 'react'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { valoresPorModo } from '@/lib/export/visao-geral'
import { NumeroClicavel } from './numero-clicavel'

type Props = {
  item: DashboardItem
  level: number
  expanded: boolean
  loading: boolean
  modo: DashboardModo
  /** Template do grid, vindo do useTableLayout. String pra preservar o memo. */
  gridTemplateColumns: string
  onToggle: () => void
  onZoom?: () => void
  onClickRealizado?: () => void
  onClickSaldo?: () => void
}

export const DashboardTreeRow = memo(function DashboardTreeRow({
  item, level, expanded, loading, modo, gridTemplateColumns,
  onToggle, onZoom, onClickRealizado, onClickSaldo,
}: Props) {
  const v = valoresPorModo(item, modo)
  const podeExpandir = item.tem_filhos
  const indent = level * 16

  return (
    <div
      role="treeitem"
      aria-level={level + 1}
      aria-expanded={podeExpandir ? expanded : undefined}
      className="grid items-center gap-2 px-2 py-1.5 hover:bg-[var(--surface-2)] border-b border-[var(--border)]"
      style={{ gridTemplateColumns, minWidth: 'max-content' }}
    >
      {/* Coluna 1: chevron + código + nome.
          O recuo hierárquico vai DENTRO da célula — quando ficava como
          paddingLeft do container do grid, cada nível estreitava e deslocava
          a linha inteira, e as colunas numéricas paravam de bater com o
          cabeçalho. */}
      {/* 1x click = expand/collapse, 2x click = zoom */}
      <div
        className={`flex items-center gap-1.5 min-w-0 ${podeExpandir || onZoom ? 'cursor-pointer' : ''}`}
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => { if (podeExpandir) onToggle() }}
        onDoubleClick={() => { if (onZoom) onZoom() }}
        title={podeExpandir ? '1× clique = expandir · 2× clique = zoom' : ''}
      >
        {podeExpandir ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
            aria-label={expanded ? 'Colapsar' : 'Expandir'}
            className="p-0.5 rounded hover:bg-[var(--surface-3)] text-[var(--text-3)]"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : expanded
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="font-mono text-[11px] text-[var(--text-3)] tabular-nums">{item.codigo}</span>
        <span className="truncate text-sm text-[var(--text-1)]">{item.nome}</span>
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-2)]">
        {v.contratado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-1)]">
        <NumeroClicavel
          value={v.realizado}
          onClick={onClickRealizado}
          ariaLabel={`Ver notas que compoem realizado de ${item.nome}`}
        />
      </div>
      <div className="text-right tabular-nums text-sm text-[var(--text-1)]">
        {modo === 'total' ? (
          // Saldo negativo = item estourado. Vermelho, nunca escondido.
          <span
            style={v.saldo < 0 ? { color: '#EF4444', fontWeight: 600 } : undefined}
            className={v.saldo < 0 ? '' : 'text-[var(--text-3)]'}
            title={v.saldo < 0 ? 'Realizado maior que o contratado' : undefined}
          >
            {v.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        ) : (
          <NumeroClicavel
            value={v.saldo}
            onClick={onClickSaldo}
            ariaLabel={`Ver pedidos com saldo de ${item.nome}`}
          />
        )}
      </div>
    </div>
  )
})
