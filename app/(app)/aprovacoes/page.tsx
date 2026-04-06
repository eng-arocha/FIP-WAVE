'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, Building2, Calendar, ArrowRight, Loader2
} from 'lucide-react'
import { formatCurrency, formatDate, getMedicaoStatusColor } from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, MedicaoStatus } from '@/types'

interface PendenteMedicao {
  id: string
  numero: number
  periodo_referencia: string
  tipo: string
  status: string
  valor_total: number
  solicitante_nome: string
  solicitante_email: string
  data_submissao: string
  contrato: {
    id: string
    numero: string
    descricao: string
    contratado: { nome: string }
  }
}

interface HistoricoMedicao {
  id: string
  numero: number
  periodo_referencia: string
  tipo: string
  status: string
  valor_total: number
  updated_at?: string
  contrato: {
    id: string
    numero: string
    contratado?: { nome: string }
  }
  aprovacoes?: { aprovador_nome: string }[]
}

export default function AprovacoesPage() {
  const [pendentes, setPendentes] = useState<PendenteMedicao[]>([])
  const [historico, setHistorico] = useState<HistoricoMedicao[]>([])
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'pendentes' | 'historico'>('pendentes')
  const [modalAprovar, setModalAprovar] = useState<string | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState<string | null>(null)
  const [comentario, setComentario] = useState('')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const [quickAprovando, setQuickAprovando] = useState<string | null>(null)
  const [rtConnected, setRtConnected] = useState(false)

  useEffect(() => {
    async function loadAprovacoes() {
      try {
        const res = await fetch('/api/aprovacoes')
        if (res.ok) {
          const data = await res.json()
          setPendentes(data.pendentes ?? [])
          setHistorico(data.historico ?? [])
        }
      } finally {
        setLoading(false)
      }
    }
    loadAprovacoes()
  }, [])

  // Realtime subscription — live updates without F5
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('aprovacoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medicoes' },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { eventType, new: newRow } = payload as any
          if (eventType === 'INSERT' && ['submetido', 'em_analise'].includes(newRow?.status)) {
            // New submission from another session — re-fetch to get joined contrato data
            fetch('/api/aprovacoes').then(r => r.json()).then(data => {
              setPendentes(data.pendentes ?? [])
            })
          } else if (eventType === 'UPDATE') {
            const newStatus: string = newRow?.status
            if (['aprovado', 'rejeitado', 'cancelado'].includes(newStatus)) {
              // A pending measurement was just acted on — move it to historico
              setPendentes(prev => {
                const item = prev.find(p => p.id === newRow.id)
                if (item) {
                  setHistorico(hist => [
                    { ...item, status: newStatus, updated_at: newRow.updated_at || new Date().toISOString() },
                    ...hist,
                  ])
                }
                return prev.filter(p => p.id !== newRow.id)
              })
            } else if (newStatus === 'submetido') {
              // Re-submitted measurement — refresh full list
              fetch('/api/aprovacoes').then(r => r.json()).then(data => {
                setPendentes(data.pendentes ?? [])
                setHistorico(data.historico ?? [])
              })
            }
          }
        }
      )
      .subscribe((status) => setRtConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function quickAprovar(m: PendenteMedicao) {
    setQuickAprovando(m.id)
    try {
      const res = await fetch(`/api/contratos/${m.contrato.id}/medicoes/${m.id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aprovadorNome: 'Fiscal FIP', aprovadorEmail: 'fiscal@fipengenharia.com.br', comentario: '', medicao: m }),
      })
      if (res.ok) {
        setPendentes(prev => prev.filter(p => p.id !== m.id))
        setHistorico(prev => [{ ...m, status: 'aprovado', updated_at: new Date().toISOString(), aprovacoes: [{ aprovador_nome: 'Fiscal FIP' }] }, ...prev])
      }
    } finally {
      setQuickAprovando(null)
    }
  }

  const medicaoAprovar = pendentes.find(m => m.id === modalAprovar)
  const medicaoRejeitar = pendentes.find(m => m.id === modalRejeitar)

  async function confirmarAprovacao() {
    if (!modalAprovar || !medicaoAprovar) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contratos/${medicaoAprovar.contrato.id}/medicoes/${medicaoAprovar.id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovadorNome: 'Fiscal FIP',
          aprovadorEmail: 'fiscal@fipengenharia.com.br',
          comentario,
          medicao: medicaoAprovar,
        }),
      })
      if (res.ok) {
        setPendentes(prev => prev.filter(m => m.id !== modalAprovar))
        setHistorico(prev => [
          {
            ...medicaoAprovar,
            status: 'aprovado',
            updated_at: new Date().toISOString(),
            aprovacoes: [{ aprovador_nome: 'Fiscal FIP' }],
          },
          ...prev,
        ])
      }
    } finally {
      setSaving(false)
      setModalAprovar(null)
      setComentario('')
    }
  }

  async function confirmarRejeicao() {
    if (!modalRejeitar || !motivo || !medicaoRejeitar) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contratos/${medicaoRejeitar.contrato.id}/medicoes/${medicaoRejeitar.id}/rejeitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovadorNome: 'Fiscal FIP',
          aprovadorEmail: 'fiscal@fipengenharia.com.br',
          motivo,
          medicao: medicaoRejeitar,
        }),
      })
      if (res.ok) {
        setPendentes(prev => prev.filter(m => m.id !== modalRejeitar))
        setHistorico(prev => [
          {
            ...medicaoRejeitar,
            status: 'rejeitado',
            updated_at: new Date().toISOString(),
            aprovacoes: [{ aprovador_nome: 'Fiscal FIP' }],
          },
          ...prev,
        ])
      }
    } finally {
      setSaving(false)
      setModalRejeitar(null)
      setMotivo('')
    }
  }

  const TIPO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Fat. Direto',
    misto: 'Misto',
  }
  const TIPO_COLORS: Record<string, string> = {
    servico: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
    faturamento_direto: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
    misto: 'bg-teal-900/40 text-teal-300 border border-teal-700/50',
  }

  const totalAprovado = [...historico].reduce((a, m) => a + m.valor_total, 0)
  const qtdAprovadas = historico.filter(h => h.status === 'aprovado').length

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
      <Topbar
        title="Fila de Aprovações"
        subtitle={
          <span className="flex items-center gap-2">
            Medições aguardando análise e histórico
            <span className="flex items-center gap-1" style={{ color: rtConnected ? '#10B981' : '#475569' }}>
              <span
                className={`w-1.5 h-1.5 rounded-full inline-block ${rtConnected ? 'animate-pulse' : ''}`}
                style={{ background: rtConnected ? '#10B981' : '#475569' }}
              />
              {rtConnected ? 'Ao Vivo' : 'Conectando...'}
            </span>
          </span>
        }
      />

      <div className="p-6">
        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Pendentes */}
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: 'var(--surface-2)',
              border: `1px solid ${pendentes.length > 0 ? 'rgba(245,158,11,0.30)' : '#1E293B'}`,
              borderLeft: `4px solid ${pendentes.length > 0 ? '#F59E0B' : '#1E293B'}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: pendentes.length > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(71,85,105,0.15)',
              }}
            >
              <Clock
                className="w-5 h-5"
                style={{ color: pendentes.length > 0 ? '#F59E0B' : '#475569' }}
              />
            </div>
            <div>
              <p
                className="text-2xl font-bold"
                style={{ color: pendentes.length > 0 ? 'var(--amber)' : 'var(--text-1)' }}
              >
                {pendentes.length}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Aguardando aprovação</p>
            </div>
          </div>

          {/* Aprovadas */}
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid rgba(16,185,129,0.20)',
              borderLeft: '4px solid #10B981',
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(16,185,129,0.12)' }}
            >
              <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--green)' }} />
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{qtdAprovadas}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Aprovadas (total)</p>
            </div>
          </div>

          {/* Total valor */}
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid rgba(59,130,246,0.20)',
              borderLeft: '4px solid #3B82F6',
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(59,130,246,0.12)' }}
            >
              <FileText className="w-5 h-5" style={{ color: '#3B82F6' }} />
            </div>
            <div>
              <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalAprovado)}</p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>Total aprovado</p>
            </div>
          </div>
        </div>

        {/* Tab switcher */}
        <div
          className="flex gap-1 mb-5 w-fit p-1 rounded-xl"
          style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setAba('pendentes')}
            className="px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 flex items-center gap-2"
            style={
              aba === 'pendentes'
                ? { background: 'var(--surface-3)', color: 'var(--text-1)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }
                : { color: 'var(--text-3)' }
            }
          >
            Pendentes
            {pendentes.length > 0 && (
              <span
                className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                style={{ background: '#F59E0B', color: '#fff' }}
              >
                {pendentes.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setAba('historico')}
            className="px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150"
            style={
              aba === 'historico'
                ? { background: 'var(--surface-3)', color: 'var(--text-1)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }
                : { color: 'var(--text-3)' }
            }
          >
            Histórico
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-xl p-5 animate-pulse"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: '#1E293B' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 rounded w-1/3" style={{ background: '#1E293B' }} />
                    <div className="h-3 rounded w-1/2" style={{ background: '#1E293B' }} />
                    <div className="h-3 rounded w-1/4" style={{ background: '#1E293B' }} />
                  </div>
                  <div className="h-6 rounded w-24" style={{ background: '#1E293B' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pendentes */}
        {!loading && aba === 'pendentes' && (
          <div className="space-y-3">
            {pendentes.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--green)', opacity: 0.6 }} />
                <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Nenhuma medição pendente</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Todas as medições foram analisadas</p>
              </div>
            ) : pendentes.map(m => (
              <div
                key={m.id}
                className="rounded-xl transition-all duration-150"
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid rgba(245,158,11,0.20)',
                  borderLeft: '4px solid #F59E0B',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.40)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(245,158,11,0.20)')}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(245,158,11,0.10)' }}
                    >
                      <AlertCircle className="w-5 h-5" style={{ color: 'var(--amber)' }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold" style={{ color: 'var(--text-1)' }}>
                              Medição #{String(m.numero).padStart(3, '0')}
                            </span>
                            <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                            </Badge>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[m.tipo]}`}
                            >
                              {TIPO_LABELS[m.tipo]}
                            </span>
                          </div>
                          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            {m.contrato.numero} · {m.contrato.descricao}
                          </p>
                        </div>
                        <p
                          className="text-xl font-bold flex-shrink-0"
                          style={{
                            background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}
                        >
                          {formatCurrency(m.valor_total)}
                        </p>
                      </div>
                      <div
                        className="grid grid-cols-3 gap-3 text-xs mb-4"
                        style={{ color: 'var(--text-3)' }}
                      >
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {m.periodo_referencia}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {m.contrato.contratado.nome}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Subm. {formatDate(m.data_submissao)}
                        </span>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => quickAprovar(m)}
                          disabled={quickAprovando === m.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150 disabled:opacity-70"
                          style={{
                            background: quickAprovando === m.id ? 'rgba(16,185,129,0.40)' : 'linear-gradient(90deg, #059669, #10B981)',
                            color: '#fff',
                            boxShadow: quickAprovando === m.id ? 'none' : '0 0 12px rgba(16,185,129,0.25)',
                          }}
                          onMouseEnter={e => { if (quickAprovando !== m.id) e.currentTarget.style.boxShadow = '0 0 24px rgba(16,185,129,0.50)' }}
                          onMouseLeave={e => { if (quickAprovando !== m.id) e.currentTarget.style.boxShadow = '0 0 12px rgba(16,185,129,0.25)' }}
                        >
                          {quickAprovando === m.id ? (
                            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                            </svg>
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          {quickAprovando === m.id ? 'Aprovando...' : 'Aprovar'}
                        </button>
                        <button
                          onClick={() => setModalRejeitar(m.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150"
                          style={{
                            background: '#EF4444',
                            color: '#fff',
                            boxShadow: '0 0 12px rgba(239,68,68,0.20)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#DC2626')}
                          onMouseLeave={e => (e.currentTarget.style.background = '#EF4444')}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Rejeitar
                        </button>
                        <Link href={`/contratos/${m.contrato.id}/medicoes/${m.id}`}>
                          <button
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                            style={{
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              color: 'var(--text-2)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.color = 'var(--text-1)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}
                          >
                            Ver detalhes <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Histórico */}
        {!loading && aba === 'historico' && (
          <div className="space-y-2">
            {historico.map(m => {
              const dataAprovacao = m.updated_at
              const aprovadorNome = m.aprovacoes?.[0]?.aprovador_nome || '—'
              const isAprovado = m.status === 'aprovado'
              return (
                <div
                  key={m.id}
                  className="rounded-xl transition-all duration-150"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a2236')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#111827')}
                >
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          background: isAprovado ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        }}
                      >
                        {isAprovado
                          ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--green)' }} />
                          : <XCircle className="w-4 h-4" style={{ color: 'var(--red)' }} />
                        }
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>
                            Medição #{String(m.numero).padStart(3, '0')}
                          </span>
                          <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                            {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                          </Badge>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TIPO_COLORS[m.tipo]}`}
                          >
                            {TIPO_LABELS[m.tipo]}
                          </span>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {m.contrato.numero} · {m.periodo_referencia}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                          {formatCurrency(m.valor_total)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {isAprovado ? 'Aprovado' : 'Rejeitado'} em{' '}
                          {dataAprovacao ? formatDate(dataAprovacao) : '—'}
                        </p>
                      </div>
                      <Link href={`/contratos/${m.contrato.id}/medicoes/${m.id}`}>
                        <button
                          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </Link>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal Aprovar */}
      <Dialog open={!!modalAprovar} onOpenChange={() => setModalAprovar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--green)' }}>
              <CheckCircle2 className="w-5 h-5" />
              Aprovar Medição
            </DialogTitle>
            <DialogDescription>
              {medicaoAprovar && (
                <>
                  <strong>{medicaoAprovar.contrato.numero}</strong> · Período {medicaoAprovar.periodo_referencia} ·{' '}
                  <strong>{formatCurrency(medicaoAprovar.valor_total)}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div
              className="p-3 rounded-lg text-xs"
              style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.20)',
                color: '#6EE7B7',
              }}
            >
              Um e-mail de confirmação será enviado automaticamente para o fornecedor e para os envolvidos no contrato.
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Comentário (opcional)
              </label>
              <Textarea
                placeholder="Observações sobre a aprovação..."
                value={comentario}
                onChange={e => setComentario(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(null)}>Cancelar</Button>
            <Button variant="success" onClick={confirmarAprovacao} loading={saving}>
              <CheckCircle2 className="w-4 h-4" />
              Aprovar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={!!modalRejeitar} onOpenChange={() => setModalRejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: 'var(--red)' }}>
              <XCircle className="w-5 h-5" />
              Rejeitar Medição
            </DialogTitle>
            <DialogDescription>
              Informe o motivo. O fornecedor receberá um e-mail explicando o que precisa ser corrigido.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                Motivo da Rejeição *
              </label>
              <Textarea
                placeholder="Descreva detalhadamente o que precisa ser corrigido..."
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarRejeicao} loading={saving} disabled={!motivo}>
              <XCircle className="w-4 h-4" />
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
