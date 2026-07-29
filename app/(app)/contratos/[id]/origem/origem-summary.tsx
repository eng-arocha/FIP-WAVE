// app/(app)/contratos/[id]/origem/origem-summary.tsx
'use client'

import type { OrigemResponse } from '@/types/origem'

export function OrigemSummary({ data }: { data: OrigemResponse }) {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] text-sm">
      <div>📊 <strong>{fmt(data.total)}</strong> total</div>
      <div>📄 <strong>{data.count}</strong> {data.origem === 'realizado' ? 'notas' : 'pedidos/medições'}</div>
      {data.resumoStatus && (
        <div className="ml-auto text-xs text-[var(--text-3)] flex items-center gap-3">
          {(data.resumoStatus.validadas ?? 0) > 0 && <span><span className="text-emerald-500">●</span> {data.resumoStatus.validadas} validadas</span>}
          {(data.resumoStatus.pendentes ?? 0) > 0 && <span><span className="text-amber-500">●</span> {data.resumoStatus.pendentes} pendentes</span>}
          {(data.resumoStatus.rejeitadas ?? 0) > 0 && <span><span className="text-rose-500">●</span> {data.resumoStatus.rejeitadas} rejeitadas</span>}
        </div>
      )}
    </div>
  )
}
