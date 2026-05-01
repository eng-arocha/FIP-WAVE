'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { DashboardItem, DashboardModo } from '@/types/dashboard'

type FlatItem = { item: DashboardItem; level: number }

type Props = {
  itens: FlatItem[]
  modo: DashboardModo
  onDoubleClickItem: (item: DashboardItem) => void
  onClickRealizado: (item: DashboardItem) => void
  onClickSaldo: (item: DashboardItem) => void
  height?: number
}

const COLORS = {
  contratado: '#3f3f46',
  realizado: '#3b82f6',
  saldo: '#eab308',
}

function buildRows(itens: FlatItem[], modo: DashboardModo) {
  return itens.map(({ item, level }) => {
    let contratado = item.valor_contratado_total
    let realizado = item.realizado_total
    let saldo = 0
    if (modo === 'material') {
      contratado = item.valor_contratado_material
      realizado = item.realizado_material
      saldo = item.saldo_aprovado_material
    } else if (modo === 'servico') {
      contratado = item.valor_contratado_servico
      realizado = item.realizado_servico
      saldo = item.saldo_medicao_servico
    }
    return {
      id: item.id,
      label: `${'  '.repeat(level)}${item.codigo} ${item.nome}`,
      contratado,
      realizado,
      saldo,
      _item: item,
    }
  })
}

function extractItem(payload: unknown): DashboardItem | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (p._item) return p._item as DashboardItem
  if (p.payload && typeof p.payload === 'object') {
    const inner = p.payload as Record<string, unknown>
    if (inner._item) return inner._item as DashboardItem
  }
  return null
}

export function DashboardBarChart({
  itens,
  modo,
  onDoubleClickItem,
  onClickRealizado,
  onClickSaldo,
  height = 320,
}: Props) {
  const rows = buildRows(itens, modo)

  return (
    <div style={{ width: '100%', height: Math.max(height, rows.length * 32 + 48) }}>
      <ResponsiveContainer>
        <BarChart
          layout="vertical"
          data={rows}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            stroke="var(--border-1)"
            strokeDasharray="3 3"
            horizontal={false}
          />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
          <YAxis
            dataKey="label"
            type="category"
            width={220}
            tick={{ fontSize: 11, fill: 'var(--text-2)' }}
            interval={0}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-1)',
              fontSize: 12,
            }}
            formatter={(v: unknown) => {
              const num = typeof v === 'number' ? v : 0
              return num.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}
          />
          <Bar
            dataKey="contratado"
            fill={COLORS.contratado}
            onDoubleClick={(payload: unknown) => {
              const item = extractItem(payload)
              if (item) onDoubleClickItem(item)
            }}
          />
          <Bar
            dataKey="realizado"
            fill={COLORS.realizado}
            onClick={(payload: unknown) => {
              const item = extractItem(payload)
              if (item) onClickRealizado(item)
            }}
            onDoubleClick={(payload: unknown) => {
              const item = extractItem(payload)
              if (item) onDoubleClickItem(item)
            }}
            style={{ cursor: 'pointer' }}
          />
          {modo !== 'total' && (
            <Bar
              dataKey="saldo"
              fill={COLORS.saldo}
              onClick={(payload: unknown) => {
                const item = extractItem(payload)
                if (item) onClickSaldo(item)
              }}
              onDoubleClick={(payload: unknown) => {
                const item = extractItem(payload)
                if (item) onDoubleClickItem(item)
              }}
              style={{ cursor: 'pointer' }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
