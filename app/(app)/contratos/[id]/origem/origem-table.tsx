// app/(app)/contratos/[id]/origem/origem-table.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { OrigemItem, OrigemResponse } from '@/types/origem'

export function OrigemTable({ data, contratoId }: { data: OrigemResponse; contratoId: string }) {
  const router = useRouter()
  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const onDouble = (item: OrigemItem) => {
    if (item.tipo === 'nf-fat-direto' || item.tipo === 'pedido-saldo') {
      const id = item.tipo === 'nf-fat-direto' ? item.pedidoId : item.id
      router.push(`/contratos/${contratoId}/fat-direto/${id}`)
    } else if (item.tipo === 'nf-wave' || item.tipo === 'medicao-saldo') {
      const id = item.tipo === 'nf-wave' ? item.medicaoId : item.id
      router.push(`/contratos/${contratoId}/medicoes/${id}`)
    }
  }

  if (data.itens.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-[var(--text-3)]">
        <p>Nenhum item encontrado para este escopo.</p>
      </div>
    )
  }

  const isNotasView = data.origem === 'realizado'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase text-[var(--text-3)] border-b border-[var(--border-1)] bg-[var(--surface-2)]">
          {isNotasView ? (
            <tr>
              <th className="text-left px-3 py-2">NF</th>
              <th className="text-left px-3 py-2">Data</th>
              <th className="text-left px-3 py-2">Pedido / Medição</th>
              <th className="text-right px-3 py-2">Valor alocado</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Tipo</th>
            </tr>
          ) : (
            <tr>
              <th className="text-left px-3 py-2">Pedido / Medição</th>
              <th className="text-left px-3 py-2">Aprovado em</th>
              <th className="text-right px-3 py-2">Aprovado</th>
              <th className="text-right px-3 py-2">Em NF</th>
              <th className="text-right px-3 py-2">Saldo</th>
              <th className="text-left px-3 py-2">Tipo</th>
            </tr>
          )}
        </thead>
        <tbody>
          {data.itens.map((it) => (
            <tr
              key={`${it.tipo}-${it.id}`}
              onDoubleClick={() => onDouble(it)}
              className="border-b border-[var(--border-1)] hover:bg-[var(--surface-2)] cursor-pointer"
              title="Duplo-clique abre o pedido/medição de origem"
            >
              {isNotasView ? (
                <>
                  <td className="px-3 py-2 font-mono text-xs">{('numero' in it) ? it.numero : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-3)]">{('data' in it) ? it.data : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--accent-1)]">
                    {it.tipo === 'nf-fat-direto' ? it.pedidoNumero : it.tipo === 'nf-wave' ? it.medicaoNumero : ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{('valorAlocado' in it) ? fmt(it.valorAlocado) : ''}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={['inline-block px-1.5 py-0.5 rounded text-[10px]',
                      ('status' in it ? it.status : '') === 'validada' ? 'bg-emerald-500/15 text-emerald-500'
                      : ('status' in it ? it.status : '') === 'pendente' ? 'bg-amber-500/15 text-amber-500'
                      : 'bg-zinc-500/15 text-zinc-400',
                    ].join(' ')}>{('status' in it) ? it.status : ''}</span>
                  </td>
                  <td className="px-3 py-2 text-[10px] uppercase text-[var(--text-3)]">{it.tipo === 'nf-fat-direto' ? 'FAT direto' : 'Medição'}</td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2 font-mono text-xs">{('numero' in it) ? it.numero : ''}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-3)]">{('aprovadoEm' in it) ? (it.aprovadoEm ?? '—') : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{('aprovado' in it) ? fmt(it.aprovado) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--text-3)]">{('emNf' in it) ? fmt(it.emNf) : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-500 font-semibold">{('saldo' in it) ? fmt(it.saldo) : ''}</td>
                  <td className="px-3 py-2 text-[10px] uppercase text-[var(--text-3)]">{it.tipo === 'pedido-saldo' ? 'FAT direto' : 'Medição'}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
