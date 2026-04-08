'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Receipt, Clock, CheckCircle2, Plus,
  ArrowRight, Package, Loader2, ChevronDown, ChevronUp,
} from 'lucide-react'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  contrato_id: string
  contrato: { id: string; numero: string; descricao: string }
  solicitante?: { nome: string }
  notas_fiscais: { id: string; numero_nf: string; valor: number; status: string }[]
  itens: { id: string }[]
}

interface NfForm {
  numero_nf: string
  cnpj_emitente: string
  valor: string
  data_emissao: string
  data_recebimento: string
  data_vencimento: string
  igual_ao_saldo: boolean
}

const EMPTY_FORM: NfForm = {
  numero_nf: '',
  cnpj_emitente: '',
  valor: '',
  data_emissao: '',
  data_recebimento: '',
  data_vencimento: '',
  igual_ao_saldo: false,
}

export default function NfFatDiretoPage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'com_saldo' | 'sem_saldo'>('com_saldo')
  const [expandedSolId, setExpandedSolId] = useState<string | null>(null)
  const [nfForm, setNfForm] = useState<NfForm>(EMPTY_FORM)
  const [savingNf, setSavingNf] = useState(false)
  const [nfError, setNfError] = useState('')

  const reload = useCallback(() => {
    setLoading(true)
    fetch('/api/nf-fat-direto')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitacoes(data) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  const getNfsValidas = (sol: Solicitacao) => sol.notas_fiscais.filter(n => n.status !== 'rejeitada')
  const getTotalNfs = (sol: Solicitacao) => getNfsValidas(sol).reduce((a, n) => a + n.valor, 0)
  const getSaldo = (sol: Solicitacao) => sol.valor_total - getTotalNfs(sol)

  const totalAprovado = solicitacoes.filter(s => s.status === 'aprovado').reduce((a, s) => a + s.valor_total, 0)
  const totalAguardando = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((a, s) => a + s.valor_total, 0)
  const totalNFs = solicitacoes.reduce((a, s) => a + getTotalNfs(s), 0)
  const totalSol = solicitacoes.length

  const filtradas = solicitacoes.filter(s => {
    if (filtroStatus === 'com_saldo') return s.status === 'aprovado' && getSaldo(s) > 0
    if (filtroStatus === 'sem_saldo') return getSaldo(s) <= 0
    return true
  })

  const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    aprovado: { label: 'APROVADO', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    aguardando_aprovacao: { label: 'AGUARDANDO', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  }

  function toggleExpand(sol: Solicitacao) {
    if (expandedSolId === sol.id) {
      setExpandedSolId(null)
      setNfForm(EMPTY_FORM)
      setNfError('')
    } else {
      setExpandedSolId(sol.id)
      setNfForm({ ...EMPTY_FORM, cnpj_emitente: sol.fornecedor_cnpj || '' })
      setNfError('')
    }
  }

  async function handleRegistrarNf(sol: Solicitacao) {
    if (!nfForm.numero_nf || !nfForm.valor || !nfForm.data_emissao) {
      setNfError('Preencha os campos obrigatórios: Número NF, Valor e Data Emissão.')
      return
    }
    setSavingNf(true)
    setNfError('')
    try {
      const res = await fetch(
        `/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/nfs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numero_nf: nfForm.numero_nf,
            emitente: sol.fornecedor_razao_social || '',
            cnpj_emitente: nfForm.cnpj_emitente || undefined,
            valor: parseFloat(nfForm.valor),
            data_emissao: nfForm.data_emissao,
            data_recebimento: nfForm.data_recebimento || undefined,
            data_vencimento: nfForm.data_vencimento || undefined,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        setNfError(err.error || 'Erro ao registrar NF.')
        return
      }
      setExpandedSolId(null)
      setNfForm(EMPTY_FORM)
      reload()
    } finally {
      setSavingNf(false)
    }
  }

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm border bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20'

  const RowContent = ({ sol }: { sol: Solicitacao }) => {
    const nfsValidas = getNfsValidas(sol)
    const totalNfSol = getTotalNfs(sol)
    const saldo = getSaldo(sol)
    const badge = STATUS_BADGE[sol.status] ?? { label: sol.status, color: '#64748B', bg: 'rgba(100,116,139,0.12)' }
    const isExpanded = expandedSolId === sol.id
    const isExpandable = sol.status === 'aprovado' && saldo > 0

    return (
      <div
        className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 items-center border-b text-sm transition-colors cursor-pointer"
        style={{
          borderColor: 'var(--border)',
          background: isExpanded ? 'var(--surface-2)' : undefined,
        }}
        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--surface-2)' }}
        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = '' }}
      >
        {/* Nº */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: nfsValidas.length > 0 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)' }}
          >
            {nfsValidas.length > 0
              ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
              : <Clock className="w-3.5 h-3.5" style={{ color: '#F59E0B' }} />}
          </div>
          <div>
            <p className="font-bold text-xs" style={{ color: 'var(--text-1)' }}>
              FIP-{String(sol.numero).padStart(4, '0')}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>{sol.contrato.numero}</p>
          </div>
        </div>

        {/* Fornecedor */}
        <div className="min-w-0">
          <p className="font-medium truncate" style={{ color: 'var(--text-1)' }}>
            {sol.fornecedor_razao_social || '—'}
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-3)' }}>
            {sol.itens.length} item(ns)
            {nfsValidas.length > 0 && ` · NF: ${formatCurrency(totalNfSol)}`}
          </p>
        </div>

        {/* Data */}
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-3)' }}>
          {formatDate(sol.data_solicitacao)}
        </span>

        {/* Valor */}
        <span className="font-bold whitespace-nowrap" style={{ color: 'var(--text-1)' }}>
          {formatCurrency(sol.valor_total)}
        </span>

        {/* Status / Actions */}
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: badge.bg, color: badge.color }}
          >
            {badge.label}
          </span>
          {isExpandable && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', border: '1px solid rgba(6,182,212,0.3)' }}
            >
              <Plus className="w-2.5 h-2.5" /> NF
            </span>
          )}
          {isExpandable
            ? (isExpanded
                ? <ChevronUp className="w-3.5 h-3.5" style={{ color: '#06B6D4' }} />
                : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />)
            : <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
      <Topbar title="NF — Faturamento Direto" subtitle="Registrar notas fiscais para solicitações aprovadas" />

      <div className="p-4 sm:p-6 space-y-5">
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'TOTAL SOLICITAÇÕES', value: String(totalSol), sub: 'Clique para ver detalhes →', color: '#3B82F6', icon: Package, onClick: () => setFiltroStatus('todos') },
            { label: 'AGUARDANDO APROVAÇÃO', value: formatCurrency(totalAguardando), sub: 'Clique para ver detalhes →', color: '#F59E0B', icon: Clock, onClick: () => setFiltroStatus('todos') },
            { label: 'TOTAL APROVADO', value: formatCurrency(totalAprovado), sub: 'Clique para ver detalhes →', color: '#10B981', icon: CheckCircle2, onClick: () => setFiltroStatus('com_saldo') },
            { label: 'NFS RECEBIDAS', value: formatCurrency(totalNFs), sub: 'Clique para ver detalhes →', color: '#06B6D4', icon: Receipt, onClick: () => setFiltroStatus('sem_saldo') },
          ].map((kpi, i) => (
            <button
              key={i}
              onClick={kpi.onClick}
              className="text-left rounded-2xl p-4 transition-all"
              style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = kpi.color + '60' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-3)' }}>{kpi.label}</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: kpi.color + '18', border: `1px solid ${kpi.color}30` }}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} strokeWidth={1.5} />
                </div>
              </div>
              <p className="text-xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-3)' }}>{kpi.sub}</p>
            </button>
          ))}
        </div>

        {/* Filtro pills */}
        <div className="flex gap-2">
          {([
            { id: 'todos', label: 'Todas' },
            { id: 'com_saldo', label: 'Pedidos com Saldo' },
            { id: 'sem_saldo', label: 'Pedidos sem Saldo' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroStatus(f.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{
                background: filtroStatus === f.id ? '#06B6D4' : 'var(--surface-2)',
                color: filtroStatus === f.id ? '#fff' : 'var(--text-2)',
                border: `1px solid ${filtroStatus === f.id ? '#06B6D4' : 'var(--border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          {/* Header */}
          <div className="px-5 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
              Solicitações de Autorização
            </h3>
            <span className="text-xs" style={{ color: 'var(--text-3)' }}>{filtradas.length} registro(s)</span>
          </div>

          {/* Colunas */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-2 text-[10px] font-bold uppercase tracking-widest border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
            <span>Nº</span>
            <span>Fornecedor</span>
            <span>Data</span>
            <span>Valor</span>
            <span>Status</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-12 text-[var(--text-3)]">Carregando...</div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: 'var(--text-3)' }} />
              <p className="text-sm" style={{ color: 'var(--text-3)' }}>Nenhuma solicitação encontrada</p>
            </div>
          ) : filtradas.map(sol => {
            const saldo = getSaldo(sol)
            const isExpandable = sol.status === 'aprovado' && saldo > 0
            const isExpanded = expandedSolId === sol.id
            const nfsValidas = getNfsValidas(sol)

            return (
              <div key={sol.id}>
                {/* Row — expandable inline or link to detail */}
                {isExpandable ? (
                  <div onClick={() => toggleExpand(sol)}>
                    <RowContent sol={sol} />
                  </div>
                ) : (
                  <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}`}>
                    <RowContent sol={sol} />
                  </Link>
                )}

                {/* Expanded NF panel */}
                {isExpanded && (
                  <div
                    className="border-b"
                    style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
                  >
                    <div className="px-5 py-4 space-y-4">
                      {/* Saldo + NFs existentes */}
                      <div className="flex flex-wrap gap-3">
                        <div
                          className="flex-1 min-w-[180px] p-3 rounded-xl"
                          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#10B981' }}>Saldo Global do Pedido</p>
                          <p className="text-2xl font-black" style={{ color: '#10B981' }}>{formatCurrency(saldo)}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                            de {formatCurrency(sol.valor_total)} aprovado
                            {nfsValidas.length > 0 && ` · ${nfsValidas.length} NF(s) registrada(s)`}
                          </p>
                        </div>

                        {nfsValidas.length > 0 && (
                          <div
                            className="flex-1 min-w-[180px] p-3 rounded-xl"
                            style={{ background: 'rgba(6,182,212,0.08)', border: '1px solid rgba(6,182,212,0.25)' }}
                          >
                            <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: '#06B6D4' }}>NFs Registradas</p>
                            <div className="space-y-1">
                              {nfsValidas.map(nf => (
                                <div key={nf.id} className="flex justify-between text-xs">
                                  <span style={{ color: 'var(--text-2)' }}>NF {nf.numero_nf}</span>
                                  <span className="font-bold" style={{ color: '#06B6D4' }}>{formatCurrency(nf.valor)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Formulário de nova NF */}
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-3)' }}>
                          Nova Nota Fiscal
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Linha 1 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Número NF *</label>
                            <input
                              placeholder="Ex: 001234"
                              value={nfForm.numero_nf}
                              onChange={e => setNfForm(p => ({ ...p, numero_nf: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data de Recebimento</label>
                            <input
                              type="date"
                              value={nfForm.data_recebimento}
                              onChange={e => setNfForm(p => ({ ...p, data_recebimento: e.target.value }))}
                              className={inputCls}
                            />
                          </div>

                          {/* Linha 2 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>CNPJ Emitente</label>
                            <input
                              placeholder="00.000.000/0000-00"
                              value={nfForm.cnpj_emitente}
                              onChange={e => setNfForm(p => ({ ...p, cnpj_emitente: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>Valor (R$) *</label>
                              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={nfForm.igual_ao_saldo}
                                  onChange={e => {
                                    const checked = e.target.checked
                                    setNfForm(p => ({
                                      ...p,
                                      igual_ao_saldo: checked,
                                      valor: checked ? String(saldo.toFixed(2)) : p.valor,
                                    }))
                                  }}
                                  className="w-3.5 h-3.5 rounded accent-cyan-500"
                                />
                                <span className="text-[10px]" style={{ color: '#06B6D4' }}>Igual ao saldo do pedido</span>
                              </label>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              value={nfForm.valor}
                              readOnly={nfForm.igual_ao_saldo}
                              onChange={e => setNfForm(p => ({ ...p, valor: e.target.value }))}
                              className={inputCls + (nfForm.igual_ao_saldo ? ' opacity-70 cursor-not-allowed' : '')}
                            />
                          </div>

                          {/* Linha 3 */}
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data Emissão *</label>
                            <input
                              type="date"
                              value={nfForm.data_emissao}
                              onChange={e => setNfForm(p => ({ ...p, data_emissao: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider block mb-1" style={{ color: 'var(--text-3)' }}>Data do Vencimento</label>
                            <input
                              type="date"
                              value={nfForm.data_vencimento}
                              onChange={e => setNfForm(p => ({ ...p, data_vencimento: e.target.value }))}
                              className={inputCls}
                            />
                          </div>
                        </div>

                        {nfError && (
                          <p className="text-xs mt-2" style={{ color: 'var(--red, #EF4444)' }}>{nfError}</p>
                        )}

                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleRegistrarNf(sol)}
                            disabled={savingNf}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            style={{ background: '#06B6D4', color: '#fff' }}
                          >
                            {savingNf
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Receipt className="w-4 h-4" />}
                            {savingNf ? 'Registrando...' : 'Registrar NF'}
                          </button>
                          <button
                            onClick={() => toggleExpand(sol)}
                            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            style={{ background: 'var(--surface-3)', color: 'var(--text-2)', border: '1px solid var(--border)' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
