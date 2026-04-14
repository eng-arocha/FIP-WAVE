'use client'

/**
 * Filtro por item do orçamento na Fila de Aprovações.
 *
 * Comportamento:
 *   1. Seleciona contrato (dropdown)
 *   2. Busca código de item (ex: 1.1.1) com autocomplete
 *   3. Ao selecionar item, card de saldo aparece com:
 *      - Valor contratado (material) do item
 *      - Já solicitado (aprovado + pendente)
 *      - Saldo disponível + % de utilização + barra colorida
 *      - Lista de pedidos FIP-XXXX que consumiram o item (clicáveis)
 *
 * Dados vêm de GET /api/contratos/[id]/saldo-por-item?codigo=X.
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Package, Search, ExternalLink, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface ItemSaldo {
  detalhamento_id: string
  codigo: string
  descricao: string
  local: string
  disciplina: string
  unidade: string
  quantidade_contratada: number
  valor_unitario_material: number
  valor_unitario_mo: number
  contratado_material: number
  contratado_mo: number
  solicitado_aprovado: number
  solicitado_pendente: number
  saldo_material: number
  pct_utilizado: number
  alerta: 'ok' | 'atencao' | 'critico' | 'esgotado'
  tarefa_codigo?: string
  grupo_codigo?: string
  pedidos?: Array<{
    solicitacao_id: string
    numero_pedido_fip?: number
    numero: number
    status: string
    fornecedor: string
    valor_no_item: number
    data_solicitacao: string
    data_aprovacao?: string | null
  }>
}

interface ContratoMin { id: string; numero: string; descricao?: string }

export function FiltroSaldoItem({
  onFilterChange,
}: {
  /** Dispara quando usuário seleciona/limpa um item. Pai pode filtrar lista. */
  onFilterChange?: (filter: { contratoId: string; codigo: string } | null) => void
}) {
  const [contratos, setContratos] = useState<ContratoMin[]>([])
  const [contratoId, setContratoId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [itens, setItens] = useState<ItemSaldo[]>([])
  const [selected, setSelected] = useState<ItemSaldo | null>(null)
  const [loadingLista, setLoadingLista] = useState(false)
  const [loadingSel, setLoadingSel] = useState(false)

  // Carrega contratos ao montar
  useEffect(() => {
    fetch('/api/contratos').then(r => r.json()).then((data: any) => {
      const arr = Array.isArray(data) ? data : (data.rows || [])
      setContratos(arr.map((c: any) => ({ id: c.id, numero: c.numero, descricao: c.descricao })))
      if (arr.length === 1) setContratoId(arr[0].id)
    }).catch(() => setContratos([]))
  }, [])

  // Ao mudar contrato, carrega lista (resumo) de itens
  useEffect(() => {
    if (!contratoId) { setItens([]); setSelected(null); return }
    setLoadingLista(true)
    fetch(`/api/contratos/${contratoId}/saldo-por-item`)
      .then(r => r.json())
      .then(data => setItens(data.itens || []))
      .catch(() => setItens([]))
      .finally(() => setLoadingLista(false))
  }, [contratoId])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return itens.slice(0, 30)
    return itens.filter(i =>
      i.codigo.toLowerCase().includes(q) ||
      (i.descricao || '').toLowerCase().includes(q) ||
      (i.local || '').toLowerCase().includes(q),
    ).slice(0, 30)
  }, [itens, query])

  async function selecionarItem(it: ItemSaldo) {
    setLoadingSel(true)
    try {
      // Requisição com ?codigo pra trazer lista detalhada de pedidos
      const res = await fetch(`/api/contratos/${contratoId}/saldo-por-item?codigo=${encodeURIComponent(it.codigo)}`)
      const data = await res.json()
      const detalhado = (data.itens || []).find((x: ItemSaldo) => x.detalhamento_id === it.detalhamento_id) || it
      setSelected(detalhado)
      onFilterChange?.({ contratoId, codigo: it.codigo })
    } finally {
      setLoadingSel(false)
    }
  }

  function limpar() {
    setSelected(null)
    setQuery('')
    onFilterChange?.(null)
  }

  const palette = {
    ok:       { bg: 'rgba(16,185,129,0.10)',  border: '#10B981', text: '#10B981' },
    atencao:  { bg: 'rgba(245,158,11,0.10)',  border: '#F59E0B', text: '#F59E0B' },
    critico:  { bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444' },
    esgotado: { bg: 'rgba(239,68,68,0.22)',   border: '#EF4444', text: '#EF4444' },
  }

  return (
    <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Package className="w-4 h-4" style={{ color: 'var(--text-2)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
          Saldo por item do orçamento
        </h3>
        {selected && (
          <button
            onClick={limpar}
            className="ml-auto text-xs px-2 py-1 rounded hover:bg-black/5 flex items-center gap-1"
            style={{ color: 'var(--text-3)' }}
          >
            <X className="w-3 h-3" /> Limpar filtro
          </button>
        )}
      </div>

      {/* Contrato + busca */}
      <div className="grid grid-cols-[1fr_2fr] gap-2 mb-3">
        <select
          value={contratoId}
          onChange={e => { setContratoId(e.target.value); setSelected(null); setQuery('') }}
          className="text-xs px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
        >
          <option value="">Selecione um contrato...</option>
          {contratos.map(c => (
            <option key={c.id} value={c.id}>{c.numero} {c.descricao ? `— ${c.descricao.slice(0, 40)}` : ''}</option>
          ))}
        </select>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Busque por código (1.1.1) ou descrição..."
            disabled={!contratoId}
            className="w-full text-xs pl-8 pr-3 py-2 rounded-lg disabled:opacity-50"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
          />
        </div>
      </div>

      {/* Lista de itens filtrados (quando não tem seleção) */}
      {contratoId && !selected && (
        <div className="max-h-64 overflow-auto rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {loadingLista ? (
            <div className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>Carregando itens...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>
              {query ? 'Nenhum item encontrado.' : 'Digite pra filtrar (ex: 1.1.1, ÁGUA PLUVIAL).'}
            </div>
          ) : (
            filtrados.map(it => {
              const p = palette[it.alerta]
              return (
                <button
                  key={it.detalhamento_id}
                  onClick={() => selecionarItem(it)}
                  className="w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-black/5 flex items-center gap-3 text-xs transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="font-mono font-semibold min-w-[60px]" style={{ color: 'var(--text-1)' }}>{it.codigo}</span>
                  <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>
                    {it.descricao}
                    {it.local && <span className="ml-1 text-[10px] opacity-70">· {it.local}</span>}
                  </span>
                  <span className="tabular-nums min-w-[100px] text-right" style={{ color: 'var(--text-2)' }}>
                    {formatCurrency(it.contratado_material)}
                  </span>
                  <span
                    className="min-w-[60px] text-right tabular-nums text-[11px] font-semibold"
                    style={{ color: p.text }}
                  >
                    {it.pct_utilizado.toFixed(0)}%
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Card de saldo detalhado (quando tem seleção) */}
      {selected && (() => {
        const p = palette[selected.alerta]
        const pct = Math.min(100, Math.max(0, selected.pct_utilizado))
        return (
          <div className="space-y-3" style={loadingSel ? { opacity: 0.5 } : {}}>
            <div className="rounded-lg p-4" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: 'var(--surface-1)', color: 'var(--text-1)' }}>
                      {selected.codigo}
                    </span>
                    <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{selected.descricao}</span>
                  </div>
                  <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                    {selected.local} · {selected.disciplina} · {selected.quantidade_contratada.toLocaleString('pt-BR')} {selected.unidade || 'UN'}
                  </p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded uppercase" style={{ background: p.bg, color: p.text, border: `1px solid ${p.border}` }}>
                  {selected.alerta}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Contratado (mat)</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(selected.contratado_material)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Aprovado</p>
                  <p className="text-sm font-bold" style={{ color: '#10B981' }}>{formatCurrency(selected.solicitado_aprovado)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Pendente</p>
                  <p className="text-sm font-bold" style={{ color: '#F59E0B' }}>{formatCurrency(selected.solicitado_pendente)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Saldo</p>
                  <p className="text-sm font-bold" style={{ color: p.text }}>{formatCurrency(selected.saldo_material)}</p>
                </div>
              </div>

              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                <div className="h-full transition-all" style={{ width: `${pct}%`, background: p.border }} />
              </div>
              <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-3)' }}>
                {pct.toFixed(1)}% do contratado utilizado
              </p>
            </div>

            {/* Pedidos que consumiram o item */}
            {selected.pedidos && selected.pedidos.length > 0 && (
              <div className="rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
                <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                    Pedidos que consumiram este item ({selected.pedidos.length})
                  </p>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                  {selected.pedidos.map(ped => (
                    <Link
                      key={ped.solicitacao_id}
                      href={`/contratos/${contratoId}/fat-direto/${ped.solicitacao_id}`}
                      className="px-3 py-2 flex items-center gap-3 hover:bg-black/5 text-xs transition-colors"
                    >
                      <span className="font-mono font-semibold" style={{ color: '#3B82F6' }}>
                        FIP-{String(ped.numero_pedido_fip ?? ped.numero).padStart(4, '0')}
                      </span>
                      <span className="flex-1 truncate" style={{ color: 'var(--text-2)' }}>{ped.fornecedor}</span>
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
                        style={{
                          background: ped.status === 'aprovado' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                          color:      ped.status === 'aprovado' ? '#10B981' : '#F59E0B',
                        }}
                      >
                        {ped.status === 'aprovado' ? 'Aprovado' : 'Pendente'}
                      </span>
                      <span className="tabular-nums font-semibold min-w-[100px] text-right" style={{ color: 'var(--text-1)' }}>
                        {formatCurrency(ped.valor_no_item)}
                      </span>
                      <ExternalLink className="w-3 h-3" style={{ color: 'var(--text-3)' }} />
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {selected.pedidos && selected.pedidos.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-3)' }}>
                Nenhum pedido consumiu este item ainda.
              </p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
