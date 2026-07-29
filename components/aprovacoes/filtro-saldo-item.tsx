'use client'

/**
 * Filtro por item do orçamento na Fila de Aprovações.
 *
 * Comportamento:
 *   1. Seleciona contrato (dropdown)
 *   2. Busca código de item (ex: 1.1.1) com autocomplete
 *   3. Ao selecionar item, card de saldo aparece com dois blocos —
 *      MATERIAL e SERVIÇO (mão de obra) — cada um com:
 *      - Valor contratado da natureza (subtotal_material / subtotal_mo)
 *      - Já solicitado (aprovado + pendente) daquela natureza
 *      - Saldo disponível + % de utilização + barra colorida
 *      e a lista de pedidos FIP-XXXX que consumiram o item (clicáveis),
 *      marcados como MATERIAL ou SERVIÇO.
 *
 *   Pedidos `wave_servico` (NF de serviço da Wave) consomem a base de MO,
 *   não a de material — antes eram debitados do material e faziam o item
 *   aparecer como "esgotado" com saldo negativo.
 *
 * Dados vêm de GET /api/contratos/[id]/saldo-por-item?codigo=X, já em ordem
 * hierárquica de código (a rota ordena com `compareCodigo`).
 */

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Package, Search, ExternalLink, X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

type Alerta = 'ok' | 'atencao' | 'critico' | 'esgotado'

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
  contratado_total: number
  /** true = contrato sem quebra material/MO; as duas naturezas dividem `contratado_total` */
  base_unica: boolean
  solicitado_aprovado_material: number
  solicitado_pendente_material: number
  solicitado_aprovado_servico: number
  solicitado_pendente_servico: number
  solicitado_aprovado: number
  solicitado_pendente: number
  saldo_material: number
  saldo_servico: number
  saldo_total: number
  pct_utilizado_material: number
  pct_utilizado_servico: number
  pct_utilizado: number
  alerta_material: Alerta
  alerta_servico: Alerta
  alerta: Alerta
  tarefa_codigo?: string
  grupo_codigo?: string
  pedidos?: Array<{
    solicitacao_id: string
    numero_pedido_fip?: number
    numero: number
    status: string
    tipo?: string | null
    natureza: 'material' | 'servico'
    fornecedor: string
    valor_no_item: number
    data_solicitacao: string
    data_aprovacao?: string | null
  }>
}

interface ContratoMin { id: string; numero: string; descricao?: string }

const palette: Record<Alerta, { bg: string; border: string; text: string }> = {
  ok:       { bg: 'rgba(16,185,129,0.10)',  border: '#10B981', text: '#10B981' },
  atencao:  { bg: 'rgba(245,158,11,0.10)',  border: '#F59E0B', text: '#F59E0B' },
  critico:  { bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444' },
  esgotado: { bg: 'rgba(239,68,68,0.22)',   border: '#EF4444', text: '#EF4444' },
}

/** Bloco de saldo de uma natureza (material ou serviço) do item. */
function BlocoNatureza({
  titulo, contratado, aprovado, pendente, saldo, pct, alerta,
}: {
  titulo: string
  contratado: number
  aprovado: number
  pendente: number
  saldo: number
  pct: number
  alerta: Alerta
}) {
  const p = palette[alerta]
  const barra = Math.min(100, Math.max(0, pct || 0))
  // Item sem valor contratado nessa natureza: nada a controlar aqui.
  const semBase = contratado <= 0 && aprovado === 0 && pendente === 0

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
          {titulo}
        </p>
        {!semBase && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
            style={{ background: p.bg, color: p.text, border: `1px solid ${p.border}` }}>
            {alerta}
          </span>
        )}
      </div>

      {semBase ? (
        <p className="text-[11px] py-2" style={{ color: 'var(--text-3)' }}>Não contratado neste item.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Contratado</p>
              <p className="text-xs font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(contratado)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Aprovado</p>
              <p className="text-xs font-bold" style={{ color: '#10B981' }}>{formatCurrency(aprovado)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Pendente</p>
              <p className="text-xs font-bold" style={{ color: '#F59E0B' }}>{formatCurrency(pendente)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Saldo</p>
              <p className="text-xs font-bold" style={{ color: p.text }}>{formatCurrency(saldo)}</p>
            </div>
          </div>

          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
            <div className="h-full transition-all" style={{ width: `${barra}%`, background: p.border }} />
          </div>
          <p className="text-[10px] mt-1 text-right" style={{ color: 'var(--text-3)' }}>
            {(pct || 0).toFixed(1)}% do contratado utilizado
          </p>
        </>
      )}
    </div>
  )
}

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

  // Cap alto o bastante pra caber o contrato inteiro (WAVE-2025-001 tem 335
  // detalhamentos). O corte antigo era 30 — sem busca, a lista parava em
  // "10.2.1" e parecia que o contrato tinha só 30 itens.
  const LIMITE_LISTA = 500

  const { visiveis, totalCasando } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const casando = !q ? itens : itens.filter(i =>
      i.codigo.toLowerCase().includes(q) ||
      (i.descricao || '').toLowerCase().includes(q) ||
      (i.local || '').toLowerCase().includes(q),
    )
    return { visiveis: casando.slice(0, LIMITE_LISTA), totalCasando: casando.length }
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
        <>
        <div className="max-h-64 overflow-auto rounded-lg" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {loadingLista ? (
            <div className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>Carregando itens...</div>
          ) : visiveis.length === 0 ? (
            <div className="text-xs text-center py-6" style={{ color: 'var(--text-3)' }}>
              {query ? 'Nenhum item encontrado.' : 'Digite pra filtrar (ex: 1.1.1, ÁGUA PLUVIAL).'}
            </div>
          ) : (
            visiveis.map(it => {
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
                    {formatCurrency(it.contratado_total)}
                  </span>
                  <span
                    className="min-w-[60px] text-right tabular-nums text-[11px] font-semibold"
                    style={{ color: p.text }}
                  >
                    {(it.pct_utilizado ?? 0).toFixed(0)}%
                  </span>
                </button>
              )
            })
          )}
        </div>
        {!loadingLista && itens.length > 0 && (
          <p className="text-[10px] mt-1.5 text-right" style={{ color: 'var(--text-3)' }}>
            {visiveis.length < totalCasando
              ? `Mostrando ${visiveis.length} de ${totalCasando} itens — refine a busca.`
              : query
                ? `${totalCasando} de ${itens.length} itens do contrato`
                : `${itens.length} itens do contrato`}
          </p>
        )}
        </>
      )}

      {/* Card de saldo detalhado (quando tem seleção) */}
      {selected && (() => {
        const p = palette[selected.alerta]
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

              {selected.base_unica ? (
                <>
                  <BlocoNatureza
                    titulo="Contratado (item)"
                    contratado={selected.contratado_total}
                    aprovado={selected.solicitado_aprovado}
                    pendente={selected.solicitado_pendente}
                    saldo={selected.saldo_material}
                    pct={selected.pct_utilizado_material}
                    alerta={selected.alerta_material}
                  />
                  <p className="text-[10px] mt-2" style={{ color: 'var(--text-3)' }}>
                    Este item não tem quebra de material / mão de obra no orçamento —
                    material e serviço dividem a mesma base contratual.
                  </p>
                </>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <BlocoNatureza
                    titulo="Material"
                    contratado={selected.contratado_material}
                    aprovado={selected.solicitado_aprovado_material}
                    pendente={selected.solicitado_pendente_material}
                    saldo={selected.saldo_material}
                    pct={selected.pct_utilizado_material}
                    alerta={selected.alerta_material}
                  />
                  <BlocoNatureza
                    titulo="Serviço (MO)"
                    contratado={selected.contratado_mo}
                    aprovado={selected.solicitado_aprovado_servico}
                    pendente={selected.solicitado_pendente_servico}
                    saldo={selected.saldo_servico}
                    pct={selected.pct_utilizado_servico}
                    alerta={selected.alerta_servico}
                  />
                </div>
              )}

              {!selected.base_unica && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text-3)' }}>Total do item (material + MO)</span>
                  <span className="tabular-nums" style={{ color: 'var(--text-2)' }}>
                    {formatCurrency(selected.contratado_total)} contratado ·{' '}
                    <strong style={{ color: selected.saldo_total < 0 ? '#EF4444' : 'var(--text-1)' }}>
                      {formatCurrency(selected.saldo_total)}
                    </strong>{' '}
                    de saldo
                  </span>
                </div>
              )}
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
                          background: ped.natureza === 'servico' ? 'rgba(139,92,246,0.15)' : 'rgba(59,130,246,0.15)',
                          color:      ped.natureza === 'servico' ? '#8B5CF6' : '#3B82F6',
                        }}
                      >
                        {ped.natureza === 'servico' ? 'Serviço' : 'Material'}
                      </span>
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
