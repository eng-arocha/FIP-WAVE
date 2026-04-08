'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  Receipt, Clock, CheckCircle2, FileText, Plus,
  ArrowRight, Building2, Calendar, Package
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

export default function NfFatDiretoPage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'sem_nf' | 'com_nf'>('sem_nf')

  useEffect(() => {
    fetch('/api/nf-fat-direto')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitacoes(data) })
      .finally(() => setLoading(false))
  }, [])

  const totalAprovado = solicitacoes.filter(s => s.status === 'aprovado').reduce((a, s) => a + s.valor_total, 0)
  const totalAguardando = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((a, s) => a + s.valor_total, 0)
  const totalNFs = solicitacoes.reduce((a, s) => a + s.notas_fiscais.filter(n => n.status !== 'rejeitada').reduce((x, n) => x + n.valor, 0), 0)
  const totalSol = solicitacoes.length

  const filtradas = solicitacoes.filter(s => {
    if (filtroStatus === 'sem_nf') return s.status === 'aprovado' && s.notas_fiscais.filter(n => n.status !== 'rejeitada').length === 0
    if (filtroStatus === 'com_nf') return s.notas_fiscais.filter(n => n.status !== 'rejeitada').length > 0
    return true
  })

  const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    aprovado: { label: 'APROVADO', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    aguardando_aprovacao: { label: 'AGUARDANDO', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
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
            { label: 'TOTAL APROVADO', value: formatCurrency(totalAprovado), sub: 'Clique para ver detalhes →', color: '#10B981', icon: CheckCircle2, onClick: () => setFiltroStatus('sem_nf') },
            { label: 'NFS RECEBIDAS', value: formatCurrency(totalNFs), sub: 'Clique para ver detalhes →', color: '#06B6D4', icon: Receipt, onClick: () => setFiltroStatus('com_nf') },
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
            { id: 'sem_nf', label: 'Aprovadas sem NF' },
            { id: 'com_nf', label: 'Com NF registrada' },
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
          {/* Header da tabela */}
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
            const badge = STATUS_BADGE[sol.status] ?? { label: sol.status, color: '#64748B', bg: 'rgba(100,116,139,0.12)' }
            const nfsValidas = sol.notas_fiscais.filter(n => n.status !== 'rejeitada')
            const totalNfSol = nfsValidas.reduce((a, n) => a + n.valor, 0)
            return (
              <Link key={sol.id} href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}`}>
                <div
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-5 py-3 items-center border-b text-sm hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--border)' }}
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

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: badge.bg, color: badge.color }}
                    >
                      {badge.label}
                    </span>
                    {sol.status === 'aprovado' && nfsValidas.length === 0 && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: 'rgba(6,182,212,0.12)', color: '#06B6D4', border: '1px solid rgba(6,182,212,0.3)' }}
                      >
                        <Plus className="w-2.5 h-2.5" /> NF
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
