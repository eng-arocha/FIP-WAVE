'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ColumnFilter, passaFiltro } from '@/components/ui/column-filter'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  CheckCircle2, XCircle, Clock, AlertCircle,
  FileText, Building2, Calendar, ArrowRight, Package, Undo2, Loader2,
} from 'lucide-react'
import { formatCurrency, formatDate, getMedicaoStatusColor } from '@/lib/utils'
import { MEDICAO_STATUS_LABELS, MedicaoStatus } from '@/types'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { MaximizableCard } from '@/components/ui/maximizable-card'

interface PendenteFip {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  valor_total: number
  observacoes?: string
  fornecedor_razao_social?: string
  contrato_id: string
  contrato: { id: string; numero: string; descricao: string }
  solicitante?: { nome: string; email: string }
  itens: { id: string }[]
}

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

interface HistoricoFip {
  id: string
  numero: number
  numero_pedido_fip: number | null
  status: string
  data_solicitacao: string
  data_aprovacao: string | null
  valor_total: number
  fornecedor_razao_social: string
  motivo_rejeicao: string | null
  contrato: { id: string; numero: string; descricao: string } | null
  solicitante: { id: string; nome: string | null; email: string | null } | null
  aprovador:   { id: string; nome: string | null; email: string | null } | null
}

export default function AprovacoesPage() {
  const { temPermissao, perfilAtual } = usePermissoes()
  const podeAprovarMedicoes = perfilAtual === 'admin' || temPermissao('medicoes', 'aprovar')
  const podeAprovarFip      = perfilAtual === 'admin' || temPermissao('aprovacoes', 'aprovar')

  const [pendentes, setPendentes] = useState<PendenteMedicao[]>([])
  const [historico, setHistorico] = useState<HistoricoMedicao[]>([])
  const [historicoFip, setHistoricoFip] = useState<HistoricoFip[]>([])
  const [pendentesFip, setPendentesFip] = useState<PendenteFip[]>([])

  // Filtros estilo Excel do histórico unificado
  const [hfTipo,        setHfTipo]        = useState<Set<string>>(new Set())
  const [hfNumero,      setHfNumero]      = useState<Set<string>>(new Set())
  const [hfContrato,    setHfContrato]    = useState<Set<string>>(new Set())
  const [hfDetalhe,     setHfDetalhe]     = useState<Set<string>>(new Set())
  const [hfSolicitante, setHfSolicitante] = useState<Set<string>>(new Set())
  const [hfAprovador,   setHfAprovador]   = useState<Set<string>>(new Set())
  const [hfDataAprov,   setHfDataAprov]   = useState<Set<string>>(new Set())
  const [hfStatus,      setHfStatus]      = useState<Set<string>>(new Set())

  // ID da linha do histórico sendo desaprovada (loading)
  const [desaprovandoHistId, setDesaprovandoHistId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<'medicoes' | 'fat-direto' | 'historico'>('medicoes')
  const [motivoFip, setMotivoFip] = useState('')
  const [rejeitandoFip, setRejeitandoFip] = useState<string | null>(null)
  const [aprovandoFip, setAprovandoFip] = useState<string | null>(null)
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
        const [res, resFip] = await Promise.all([
          fetch('/api/aprovacoes'),
          fetch('/api/aprovacoes/fat-direto'),
        ])
        if (res.ok) {
          const data = await res.json()
          setPendentes(data.pendentes ?? [])
          setHistorico(data.historico ?? [])
          setHistoricoFip(data.historicoFip ?? [])
        }
        if (resFip.ok) {
          const dataFip = await resFip.json()
          setPendentesFip(dataFip.pendentes ?? [])
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

  async function aprovarFip(sol: PendenteFip) {
    setAprovandoFip(sol.id)
    try {
      const res = await fetch(`/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'aprovado' }),
      })
      if (res.ok) setPendentesFip(prev => prev.filter(s => s.id !== sol.id))
    } finally {
      setAprovandoFip(null)
    }
  }

  async function rejeitarFip(sol: PendenteFip) {
    if (!motivoFip.trim()) return
    setRejeitandoFip(sol.id)
    try {
      const res = await fetch(`/api/contratos/${sol.contrato_id}/fat-direto/solicitacoes/${sol.id}/aprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'rejeitado', motivo_rejeicao: motivoFip }),
      })
      if (res.ok) { setPendentesFip(prev => prev.filter(s => s.id !== sol.id)); setMotivoFip('') }
    } finally {
      setRejeitandoFip(null)
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

  // Stats: soma de todos os aprovados (medições + FIP)
  const totalAprovado =
      historico.filter(h => h.status === 'aprovado').reduce((a, m) => a + (m.valor_total || 0), 0)
    + historicoFip.filter(h => h.status === 'aprovado').reduce((a, m) => a + (m.valor_total || 0), 0)
  const qtdAprovadas =
      historico.filter(h => h.status === 'aprovado').length
    + historicoFip.filter(h => h.status === 'aprovado').length

  // ── Histórico unificado: tabela estilo Excel ─────────────────────────
  const podeDesaprovarFip = podeAprovarFip
  const nomeExibido = (p: { nome: string | null; email: string | null } | null | undefined) =>
    p?.nome?.trim() || (p?.email ? p.email.split('@')[0] : '—')

  interface HistRow {
    id: string
    kind: 'medicao' | 'fip'
    tipo: string
    numero: string
    contrato: string
    detalhe: string
    solicitante: string
    aprovador: string
    data: string // ISO ou ''
    valor: number
    status: string
    statusLabel: string
    linkHref: string
    // FIP-specific
    raw?: HistoricoFip
  }

  const rowsUnificadas: HistRow[] = useMemo(() => {
    const rows: HistRow[] = []
    for (const m of historico) {
      rows.push({
        id: `med-${m.id}`,
        kind: 'medicao',
        tipo: 'Medição',
        numero: `Med #${String(m.numero).padStart(3, '0')}`,
        contrato: m.contrato?.numero ?? '—',
        detalhe: m.periodo_referencia || '—',
        solicitante: '—', // Medições não têm solicitante no shape atual
        aprovador: m.aprovacoes?.[0]?.aprovador_nome || '—',
        data: m.updated_at || '',
        valor: m.valor_total || 0,
        status: m.status,
        statusLabel: m.status === 'aprovado' ? 'Aprovada' : m.status === 'rejeitado' ? 'Rejeitada' : 'Cancelada',
        linkHref: `/contratos/${m.contrato.id}/medicoes/${m.id}`,
      })
    }
    for (const f of historicoFip) {
      rows.push({
        id: `fip-${f.id}`,
        kind: 'fip',
        tipo: 'Fat. Direto',
        numero: f.numero_pedido_fip ? `FIP-${String(f.numero_pedido_fip).padStart(4, '0')}` : `#${f.numero}`,
        contrato: f.contrato?.numero ?? '—',
        detalhe: f.fornecedor_razao_social || '—',
        solicitante: nomeExibido(f.solicitante),
        aprovador: nomeExibido(f.aprovador),
        data: f.data_aprovacao || '',
        valor: f.valor_total || 0,
        status: f.status,
        statusLabel: f.status === 'aprovado' ? 'Aprovada' : f.status === 'rejeitado' ? 'Rejeitada' : 'Cancelada',
        linkHref: f.contrato ? `/contratos/${f.contrato.id}/fat-direto` : '#',
        raw: f,
      })
    }
    // Ordena por data desc (mais recente primeiro)
    rows.sort((a, b) => (b.data || '').localeCompare(a.data || ''))
    return rows
  }, [historico, historicoFip])

  const valoresHistUnicos = useMemo(() => ({
    tipo:        rowsUnificadas.map(r => r.tipo),
    numero:      rowsUnificadas.map(r => r.numero),
    contrato:    rowsUnificadas.map(r => r.contrato),
    detalhe:     rowsUnificadas.map(r => r.detalhe),
    solicitante: rowsUnificadas.map(r => r.solicitante),
    aprovador:   rowsUnificadas.map(r => r.aprovador),
    // Data exibida em dd/mm/yyyy — filtro trabalha sobre o mesmo texto
    dataAprov:   rowsUnificadas.map(r => r.data ? formatDate(r.data) : '—'),
    status:      rowsUnificadas.map(r => r.statusLabel),
  }), [rowsUnificadas])

  const rowsFiltradas = useMemo(() => {
    return rowsUnificadas.filter(r => {
      if (!passaFiltro(hfTipo,        r.tipo))        return false
      if (!passaFiltro(hfNumero,      r.numero))      return false
      if (!passaFiltro(hfContrato,    r.contrato))    return false
      if (!passaFiltro(hfDetalhe,     r.detalhe))     return false
      if (!passaFiltro(hfSolicitante, r.solicitante)) return false
      if (!passaFiltro(hfAprovador,   r.aprovador))   return false
      if (!passaFiltro(hfDataAprov,   r.data ? formatDate(r.data) : '—')) return false
      if (!passaFiltro(hfStatus,      r.statusLabel)) return false
      return true
    })
  }, [rowsUnificadas, hfTipo, hfNumero, hfContrato, hfDetalhe, hfSolicitante, hfAprovador, hfDataAprov, hfStatus])

  async function desaprovarDoHistorico(row: HistRow) {
    if (row.kind !== 'fip') {
      alert('Desaprovar medição ainda não está disponível — use o botão de rejeitar no painel da medição.')
      return
    }
    const motivo = prompt(
      `Desaprovar ${row.numero} de ${row.detalhe}?\n\n` +
      `Ela voltará ao status "Rascunho" e só o solicitante original (ou admin) poderá editar/excluir.\n\n` +
      `Informe o MOTIVO da desaprovação:`
    )
    if (motivo === null) return
    if (!motivo.trim()) { alert('O motivo é obrigatório.'); return }

    // row.id = "fip-<uuid>" → extrai o uuid puro
    const fipId = row.id.replace(/^fip-/, '')
    setDesaprovandoHistId(row.id)
    try {
      const res = await fetch(`/api/fat-direto/solicitacoes/${fipId}/desaprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      if (res.ok) {
        setHistoricoFip(prev => prev.filter(f => f.id !== fipId))
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Não foi possível desaprovar.')
      }
    } finally {
      setDesaprovandoHistId(null)
    }
  }

  return (
    <div className="flex-1" style={{ background: 'var(--background)' }}>
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

      <div className="p-3 sm:p-6">
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
                style={{ color: (pendentes.length + pendentesFip.length) > 0 ? 'var(--amber)' : 'var(--text-1)' }}
              >
                {pendentes.length + pendentesFip.length}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-3)' }}>
                {pendentes.length} medição + {pendentesFip.length} FIP
              </p>
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
          {([
            { id: 'medicoes', label: 'Medições de Serviço', count: pendentes.length },
            { id: 'fat-direto', label: 'Faturamento Direto', count: pendentesFip.length },
            { id: 'historico', label: 'Histórico', count: historico.length + historicoFip.length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setAba(tab.id)}
              className="px-4 py-1.5 text-sm font-medium rounded-lg transition-all duration-150 flex items-center gap-2"
              style={
                aba === tab.id
                  ? { background: 'var(--surface-3)', color: 'var(--text-1)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }
                  : { color: 'var(--text-3)' }
              }
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                  style={{ background: '#F59E0B', color: '#fff' }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
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

        {/* Medições de Serviço */}
        {!loading && aba === 'medicoes' && (
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
                        {podeAprovarMedicoes && (
                          <>
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
                          </>
                        )}
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

        {/* Fat. Direto pendentes */}
        {!loading && aba === 'fat-direto' && (
          <div className="space-y-3">
            {pendentesFip.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--green)', opacity: 0.6 }} />
                <p className="font-semibold" style={{ color: 'var(--text-2)' }}>Nenhuma solicitação pendente</p>
                <p className="text-sm mt-1" style={{ color: 'var(--text-3)' }}>Todas as solicitações foram analisadas</p>
              </div>
            ) : pendentesFip.map(sol => (
              <div
                key={sol.id}
                className="rounded-xl transition-all duration-150"
                style={{ background: 'var(--surface-2)', border: '1px solid rgba(6,182,212,0.25)', borderLeft: '4px solid #06B6D4' }}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(6,182,212,0.10)' }}>
                      <Package className="w-5 h-5" style={{ color: '#06B6D4' }} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold" style={{ color: 'var(--text-1)' }}>
                              FIP-{String(sol.numero).padStart(4, '0')}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-900/40 text-cyan-300 border border-cyan-700/50">
                              Fat. Direto
                            </span>
                          </div>
                          <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            {sol.contrato.numero} · {sol.contrato.descricao}
                          </p>
                          {sol.fornecedor_razao_social && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>{sol.fornecedor_razao_social}</p>
                          )}
                        </div>
                        <p className="text-xl font-bold flex-shrink-0"
                          style={{ background: 'linear-gradient(90deg, #06B6D4, #3B82F6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                          {formatCurrency(sol.valor_total)}
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs mb-4" style={{ color: 'var(--text-3)' }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {formatDate(sol.data_solicitacao)}
                        </span>
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {sol.itens.length} item(ns)
                        </span>
                        {sol.solicitante && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {sol.solicitante.nome}
                          </span>
                        )}
                      </div>
                      {/* Motivo rejeição inline */}
                      {rejeitandoFip === sol.id && (
                        <div className="mb-3">
                          <input
                            type="text"
                            value={motivoFip}
                            onChange={e => setMotivoFip(e.target.value)}
                            placeholder="Motivo da rejeição (obrigatório)..."
                            autoFocus
                            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                            style={{ background: 'var(--background)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--text-1)' }}
                          />
                        </div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {!podeAprovarFip ? (
                          <span className="text-xs italic px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
                            Sem permissão para aprovar — apenas administradores Wave podem aprovar solicitações.
                          </span>
                        ) : rejeitandoFip !== sol.id ? (
                          <>
                            <button
                              onClick={() => aprovarFip(sol)}
                              disabled={aprovandoFip === sol.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-70"
                              style={{ background: 'linear-gradient(90deg, #059669, #10B981)', color: '#fff', boxShadow: '0 0 12px rgba(16,185,129,0.25)' }}
                            >
                              {aprovandoFip === sol.id
                                ? <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Aprovando...</>
                                : <><CheckCircle2 className="w-3.5 h-3.5" /> Aprovar</>}
                            </button>
                            <button
                              onClick={() => setRejeitandoFip(sol.id)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
                              style={{ background: '#EF4444', color: '#fff' }}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Rejeitar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => rejeitarFip(sol)}
                              disabled={!motivoFip.trim()}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                              style={{ background: '#EF4444', color: '#fff' }}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Confirmar Rejeição
                            </button>
                            <button
                              onClick={() => { setRejeitandoFip(null); setMotivoFip('') }}
                              className="px-4 py-2 rounded-lg text-sm"
                              style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                        <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}`}>
                          <button
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                            style={{ border: '1px solid var(--border)', color: 'var(--text-2)' }}
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

        {/* Histórico — tabela unificada estilo Excel */}
        {!loading && aba === 'historico' && (
          <MaximizableCard title="Histórico de Aprovações" className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(() => {
              const gridCols = podeDesaprovarFip
                ? '100px 110px 120px 1fr 1fr 1fr 110px 130px 110px 48px'
                : '100px 110px 120px 1fr 1fr 1fr 110px 130px 110px'
              return (
                <>
                  {/* Header com filtros Excel — sticky pra ficar visível no scroll (especialmente quando maximizado) */}
                  <div
                    className="grid text-[11px] font-semibold uppercase tracking-wide px-4 py-2.5 sticky top-0 z-10"
                    style={{
                      gridTemplateColumns: gridCols,
                      gap: '8px',
                      background: 'var(--surface-3)',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text-3)',
                    }}
                  >
                    <span className="flex items-center gap-1">
                      Tipo
                      <ColumnFilter label="Tipo" values={valoresHistUnicos.tipo} selected={hfTipo} onChange={setHfTipo} />
                    </span>
                    <span className="flex items-center gap-1">
                      Número
                      <ColumnFilter label="Número" values={valoresHistUnicos.numero} selected={hfNumero} onChange={setHfNumero} />
                    </span>
                    <span className="flex items-center gap-1">
                      Contrato
                      <ColumnFilter label="Contrato" values={valoresHistUnicos.contrato} selected={hfContrato} onChange={setHfContrato} />
                    </span>
                    <span className="flex items-center gap-1">
                      Fornecedor/Período
                      <ColumnFilter label="Fornecedor/Período" values={valoresHistUnicos.detalhe} selected={hfDetalhe} onChange={setHfDetalhe} />
                    </span>
                    <span className="flex items-center gap-1">
                      Solicitante
                      <ColumnFilter label="Solicitante" values={valoresHistUnicos.solicitante} selected={hfSolicitante} onChange={setHfSolicitante} />
                    </span>
                    <span className="flex items-center gap-1">
                      Aprovador
                      <ColumnFilter label="Aprovador" values={valoresHistUnicos.aprovador} selected={hfAprovador} onChange={setHfAprovador} />
                    </span>
                    <span className="flex items-center gap-1">
                      Data aprov.
                      <ColumnFilter label="Data aprov." values={valoresHistUnicos.dataAprov} selected={hfDataAprov} onChange={setHfDataAprov} />
                    </span>
                    <span className="text-right">Valor</span>
                    <span className="flex items-center gap-1">
                      Status
                      <ColumnFilter label="Status" values={valoresHistUnicos.status} selected={hfStatus} onChange={setHfStatus} />
                    </span>
                    {podeDesaprovarFip && <span className="text-center" title="Ações">·</span>}
                  </div>

                  {/* Linhas */}
                  {rowsFiltradas.length === 0 ? (
                    <div className="text-center py-12" style={{ color: 'var(--text-3)' }}>
                      <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="text-sm">
                        {rowsUnificadas.length === 0
                          ? 'Nenhuma aprovação concluída ainda.'
                          : 'Nenhum resultado com os filtros aplicados.'}
                      </p>
                    </div>
                  ) : (
                    rowsFiltradas.map((row, idx) => {
                      const isAprovada = row.status === 'aprovado'
                      const isRejeitada = row.status === 'rejeitado'
                      return (
                        <div
                          key={row.id}
                          className="grid items-center px-4 py-3 transition-colors"
                          style={{
                            gridTemplateColumns: gridCols,
                            gap: '8px',
                            background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                            borderBottom: '1px solid var(--border)',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}
                        >
                          {/* Tipo */}
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-medium text-center truncate"
                            style={{
                              background: row.kind === 'fip' ? 'rgba(245,158,11,0.12)' : 'rgba(139,92,246,0.12)',
                              color: row.kind === 'fip' ? '#F59E0B' : '#8B5CF6',
                            }}
                          >
                            {row.tipo}
                          </span>
                          {/* Número */}
                          <span className="text-xs font-bold font-mono truncate" style={{ color: 'var(--accent)' }}>
                            {row.numero}
                          </span>
                          {/* Contrato */}
                          <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{row.contrato}</span>
                          {/* Detalhe (fornecedor ou período) */}
                          <span className="text-xs truncate" style={{ color: 'var(--text-1)' }} title={row.detalhe}>
                            {row.detalhe}
                          </span>
                          {/* Solicitante */}
                          <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{row.solicitante}</span>
                          {/* Aprovador */}
                          <span className="text-xs truncate" style={{ color: 'var(--text-2)' }}>{row.aprovador}</span>
                          {/* Data aprov */}
                          <span className="text-xs" style={{ color: 'var(--text-3)' }}>{formatDate(row.data)}</span>
                          {/* Valor */}
                          <span className="text-xs font-semibold text-right" style={{ color: 'var(--text-1)' }}>
                            {formatCurrency(row.valor)}
                          </span>
                          {/* Status */}
                          <span
                            className="text-[10px] px-2 py-0.5 rounded-full font-semibold text-center truncate inline-flex items-center gap-1 justify-center"
                            style={{
                              background: isAprovada ? 'rgba(16,185,129,0.12)' : isRejeitada ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
                              color: isAprovada ? '#10B981' : isRejeitada ? '#EF4444' : 'var(--text-3)',
                            }}
                          >
                            {isAprovada ? <CheckCircle2 className="w-3 h-3" /> : isRejeitada ? <XCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {row.statusLabel}
                          </span>
                          {/* Ações */}
                          {podeDesaprovarFip && (
                            <div className="flex justify-center">
                              {row.kind === 'fip' && isAprovada ? (
                                <button
                                  onClick={() => desaprovarDoHistorico(row)}
                                  disabled={desaprovandoHistId === row.id}
                                  title="Desaprovar — volta para rascunho"
                                  className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                                  style={{ background: 'rgba(245,158,11,0.10)', color: '#F59E0B' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.22)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.10)' }}
                                >
                                  {desaprovandoHistId === row.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Undo2 className="w-3.5 h-3.5" strokeWidth={1.8} />}
                                </button>
                              ) : (
                                <Link href={row.linkHref}>
                                  <button
                                    title="Ver detalhes"
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                                    style={{ color: 'var(--text-3)' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text-1)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)' }}
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}

                  {/* Footer com contagem */}
                  {rowsFiltradas.length > 0 && (
                    <div
                      className="flex items-center justify-between px-4 py-3"
                      style={{ background: 'var(--surface-3)', borderTop: '1px solid var(--border)' }}
                    >
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                        {rowsFiltradas.length} de {rowsUnificadas.length} item(ns)
                      </span>
                    </div>
                  )}
                </>
              )
            })()}
          </MaximizableCard>
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
