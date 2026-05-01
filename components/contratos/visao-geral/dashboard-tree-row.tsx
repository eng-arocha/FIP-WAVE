// components/contratos/visao-geral/dashboard-tree-row.tsx
'use client'

import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { memo } from 'react'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'
import { NumeroClicavel } from './numero-clicavel'

type Props = {
  item: DashboardItem
  level: number
  expanded: boolean
  loading: boolean
  modo: DashboardModo
  onToggle: () => void
  onClickRealizado?: () => void
  onClickSaldo?: () => void
}

function getValores(item: DashboardItem, modo: DashboardModo) {
  if (modo === 'material') {
    return {
      contratado: item.valor_contratado_material,
      realizado: item.realizado_material,
      saldo: item.saldo_aprovado_material,
      saldoLabel: 'Saldo aprovado',
    }
  }
  if (modo === 'servico') {
    return {
      contratado: item.valor_contratado_servico,
      realizado: item.realizado_servico,
      saldo: item.saldo_medicao_servico,
      saldoLabel: 'Saldo medição',
    }
  }
  return {
    contratado: item.valor_contratado_total,
    realizado: item.realizado_total,
    saldo: 0,
    saldoLabel: '—',
  }
}

export const DashboardTreeRow = memo(function DashboardTreeRow({
  item, level, expanded, loading, modo, onToggle, onClickRealizado, onClickSaldo,
}: Props) {
  const v = getValores(item, modo)
  const podeExpandir = item.tem_filhos
  const indent = level * 16

  return (
    <div
      role="treeitem"
      aria-level={level + 1}
      aria-expanded={podeExpandir ? expanded : undefined}
      className="grid grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr] items-center gap-2 px-2 py-1.5 hover:bg-[var(--surface-2)] border-b border-[var(--border-1)] cursor-default"
      onDoubleClick={() => { if (podeExpandir) onToggle() }}
      style={{ paddingLeft: `${indent + 8}px` }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {podeExpandir ? (
          <button
            type="button"
            onClick={onToggle}
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
          <span className="text-[var(--text-3)]">
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
