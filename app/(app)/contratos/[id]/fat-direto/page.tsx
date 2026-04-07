'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ArrowLeft, FileText, CheckCircle, Clock, XCircle, Package, ClipboardList, Timer, BadgeCheck, Receipt, Undo2, ChevronDown, X, BarChart2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { usePermissoes } from '@/lib/context/permissoes-context'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  solicitante?: { nome: string }
  itens?: Array<{ id: string; descricao: string; qtde_solicitada: number; valor_total: number }>
  notas_fiscais?: Array<{ id: string; valor: number; status: string }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:              { label: 'Rascunho',           color: 'var(--text-3)', icon: <FileText className="w-3 h-3" /> },
  aguardando_aprovacao:  { label: 'Aguard. Aprovação',  color: 'var(--amber)', icon: <Clock className="w-3 h-3" /> },
  aprovado:              { label: 'Aprovado',            color: 'var(--green)', icon: <CheckCircle className="w-3 h-3" /> },
  rejeitado:             { label: 'Rejeitado',           color: 'var(--red)', icon: <XCircle className="w-3 h-3" /> },
  cancelado:             { label: 'Cancelado',           color: 'var(--text-3)', icon: <XCircle className="w-3 h-3" /> },
}

type KpiKey = 'total' | 'pendente' | 'aprovado' | 'nf'

const KPI_META: Record<KpiKey, { label: string; statusFilter?: string; color: string }> = {
  total:    { label: 'Total Solicitações',    color: '#3B82F6' },
  pendente: { label: 'Aguardando Aprovação',  statusFilter: 'aguardando_aprovacao', color: 'var(--amber)' },
  aprovado: { label: 'Total Aprovado',        statusFilter: 'aprovado',             color: 'var(--green)' },
  nf:       { label: 'NFs Recebidas',                                               color: '#06B6D4' },
}

export default function FatDiretoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { perfilAtual } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Report state
  const [activeKpi, setActiveKpi] = useState<KpiKey | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('_todos')
  const [filterFornecedor, setFilterFornecedor] = useState<string>('_todos')
  const [filterMes, setFilterMes] = useState<string>('_todos')

  // Sort for main list
  type SortKey = 'numero' | 'data_solicitacao' | 'fornecedor' | 'valor_total' | 'status'
  const [sortKey, setSortKey] = useState<SortKey>('numero')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-30" />
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3" style={{ color: 'var(--accent)' }} />
      : <ArrowDown className="w-3 h-3" style={{ color: 'var(--accent)' }} />
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/contratos/${id}/fat-direto/solicitacoes`).then(r => r.json()),
      fetch(`/api/contratos/${id}`).then(r => r.json()),
    ]).then(([sols, contrato]) => {
      setSolicitacoes(Array.isArray(sols) ? sols : [])
      setResumo(contrato)
      setLoading(false)
    })
  }, [id])

  async function desaprovar(e: React.MouseEvent, solId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Desaprovar esta solicitação?')) return
    await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'aguardando_aprovacao' }),
    })
    const sols = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes`).then(r => r.json())
    setSolicitacoes(Array.isArray(sols) ? sols : [])
  }

  function openReport(kpi: KpiKey) {
    if (activeKpi === kpi) {
      setActiveKpi(null)
      return
    }
    setActiveKpi(kpi)
    // Pre-set status filter based on which card was clicked
    const meta = KPI_META[kpi]
    setFilterStatus(meta.statusFilter ?? '_todos')
    setFilterFornecedor('_todos')
    setFilterMes('_todos')
  }

  const totalAprovado = solicitacoes.filter(s => s.status === 'aprovado').reduce((sum, s) => sum + s.valor_total, 0)
  const totalPendente = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((sum, s) => sum + s.valor_total, 0)
  const totalNFs = solicitacoes.reduce((sum, s) => sum + (s.notas_fiscais?.filter(n => n.status !== 'rejeitada').reduce((a, n) => a + n.valor, 0) || 0), 0)
  const teto = resumo?.valor_material_direto ?? 0
  const saldoDisponivel = teto - totalAprovado
  const pctUsado = teto > 0 ? Math.round((totalAprovado / teto) * 100) : 0

  // Sorted main list
  const sortedSolicitacoes = useMemo(() => {
    return [...solicitacoes].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'numero') cmp = a.numero - b.numero
      else if (sortKey === 'data_solicitacao') cmp = new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime()
      else if (sortKey === 'fornecedor') cmp = (a.fornecedor_razao_social || '').localeCompare(b.fornecedor_razao_social || '')
      else if (sortKey === 'valor_total') cmp = a.valor_total - b.valor_total
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [solicitacoes, sortKey, sortDir])

  // Unique fornecedores for dropdown
  const fornecedores = useMemo(() => {
    const set = new Set<string>()
    solicitacoes.forEach(s => { if (s.fornecedor_razao_social) set.add(s.fornecedor_razao_social) })
    return Array.from(set).sort()
  }, [solicitacoes])

  // Unique months for dropdown
  const meses = useMemo(() => {
    const set = new Set<string>()
    solicitacoes.forEach(s => {
      if (s.data_solicitacao) {
        const d = new Date(s.data_solicitacao)
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }
    })
    return Array.from(set).sort().reverse()
  }, [solicitacoes])

  // Base set for the active KPI card
  const baseSet = useMemo(() => {
    if (!activeKpi) return solicitacoes
    if (activeKpi === 'nf') return solicitacoes.filter(s => (s.notas_fiscais || []).some(n => n.status !== 'rejeitada'))
    const meta = KPI_META[activeKpi]
    if (meta.statusFilter) return solicitacoes.filter(s => s.status === meta.statusFilter)
    return solicitacoes
  }, [activeKpi, solicitacoes])

  // Apply dropdown filters on top
  const reportRows = useMemo(() => {
    return baseSet.filter(s => {
      if (filterStatus !== '_todos' && s.status !== filterStatus) return false
      if (filterFornecedor !== '_todos' && s.fornecedor_razao_social !== filterFornecedor) return false
      if (filterMes !== '_todos') {
        const d = new Date(s.data_solicitacao)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (ym !== filterMes) return false
      }
      return true
    })
  }, [baseSet, filterStatus, filterFornecedor, filterMes])

  const reportTotal = reportRows.reduce((sum, s) => sum + s.valor_total, 0)

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Faturamento Direto" />
      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}`}>
              <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2 px-2 sm:px-3">
                <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Contrato</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                Faturamento Direto
              </h1>
              <p className="text-xs sm:text-sm text-[var(--text-3)] hidden sm:block">Controle de autorização de compras de material</p>
            </div>
          </div>
          <Link href={`/contratos/${id}/fat-direto/nova`}>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 sm:px-4">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nova Solicitação</span><span className="sm:hidden">Nova</span>
            </Button>
          </Link>
        </div>

        {/* Teto consumption bar */}
        {teto > 0 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Consumo do Teto de Material</span>
                  <span className="ml-2 text-xs font-bold" style={{ color: pctUsado > 90 ? '#EF4444' : pctUsado > 70 ? '#F59E0B' : '#10B981' }}>
                    {pctUsado}% usado
                  </span>
                </div>
                <span className="text-xs text-[var(--text-3)]">Saldo: <span className="font-bold" style={{ color: saldoDisponivel < 0 ? '#EF4444' : '#10B981' }}>{formatCurrency(saldoDisponivel)}</span></span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min(pctUsado, 100)}%`,
                  background: pctUsado > 90 ? '#EF4444' : pctUsado > 70 ? '#F59E0B' : 'linear-gradient(90deg, #10B981, #06B6D4)',
                }} />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-3)] mt-1">
                <span>Aprovado: {formatCurrency(totalAprovado)}</span>
                <span>Teto: {formatCurrency(teto)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards — clickable */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { key: 'total'    as KpiKey, label: 'Total Solicitações',   value: solicitacoes.length, type: 'count',    color: '#3B82F6',         bg: 'rgba(59,130,246,0.10)',  border: 'rgba(59,130,246,0.20)',  Icon: ClipboardList },
            { key: 'pendente' as KpiKey, label: 'Aguardando Aprovação', value: totalPendente,       type: 'currency', color: 'var(--amber)',     bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', Icon: Timer },
            { key: 'aprovado' as KpiKey, label: 'Total Aprovado',        value: totalAprovado,       type: 'currency', color: 'var(--green)',     bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', Icon: BadgeCheck },
            { key: 'nf'       as KpiKey, label: 'NFs Recebidas',         value: totalNFs,            type: 'currency', color: '#06B6D4',          bg: 'rgba(6,182,212,0.10)',  border: 'rgba(6,182,212,0.20)',  Icon: Receipt },
          ] as const).map(kpi => {
            const isActive = activeKpi === kpi.key
            return (
              <button
                key={kpi.key}
                onClick={() => openReport(kpi.key)}
                className="text-left rounded-xl transition-all duration-200 focus:outline-none"
                style={{
                  background: isActive ? `${kpi.bg.replace('0.10', '0.18')}` : 'var(--surface-1)',
                  border: `2px solid ${isActive ? kpi.color : 'var(--border)'}`,
                  boxShadow: isActive ? `0 0 0 2px ${kpi.color}22` : undefined,
                  transform: isActive ? 'translateY(-1px)' : undefined,
                }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs text-[var(--text-3)] uppercase tracking-wider font-semibold leading-tight">{kpi.label}</p>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ml-2" style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}>
                      <kpi.Icon className="w-4 h-4" style={{ color: kpi.color }} />
                    </div>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: kpi.color }}>
                    {kpi.type === 'currency' ? formatCurrency(kpi.value as number) : kpi.value}
                  </p>
                  <p className="text-[10px] mt-1.5 font-medium" style={{ color: isActive ? kpi.color : 'var(--text-3)' }}>
                    {isActive ? 'Clique para fechar ↑' : 'Clique para ver detalhes →'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Inline Report Panel */}
        {activeKpi && (
          <Card style={{ background: 'var(--surface-1)', border: `1px solid ${KPI_META[activeKpi].color}40` }}>
            <CardHeader className="pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4" style={{ color: KPI_META[activeKpi].color }} />
                  <CardTitle className="text-base" style={{ color: 'var(--text-1)' }}>
                    Relatório — {KPI_META[activeKpi].label}
                  </CardTitle>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: `${KPI_META[activeKpi].color}20`, color: KPI_META[activeKpi].color }}>
                    {reportRows.length} registros
                  </span>
                </div>
                <button
                  onClick={() => setActiveKpi(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                  style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mt-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-[var(--text-3)] font-medium">Status</span>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="h-7 text-xs w-44 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_todos">Todos</SelectItem>
                      <SelectItem value="rascunho">Rascunho</SelectItem>
                      <SelectItem value="aguardando_aprovacao">Aguard. Aprovação</SelectItem>
                      <SelectItem value="aprovado">Aprovado</SelectItem>
                      <SelectItem value="rejeitado">Rejeitado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {fornecedores.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-3)] font-medium">Fornecedor</span>
                    <Select value={filterFornecedor} onValueChange={setFilterFornecedor}>
                      <SelectTrigger className="h-7 text-xs w-48 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_todos">Todos</SelectItem>
                        {fornecedores.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {meses.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-[var(--text-3)] font-medium">Período</span>
                    <Select value={filterMes} onValueChange={setFilterMes}>
                      <SelectTrigger className="h-7 text-xs w-36 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_todos">Todos</SelectItem>
                        {meses.map(m => {
                          const [y, mo] = m.split('-')
                          const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
                          return <SelectItem key={m} value={m}>{label}</SelectItem>
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(filterStatus !== '_todos' || filterFornecedor !== '_todos' || filterMes !== '_todos') && (
                  <button
                    onClick={() => { setFilterStatus(KPI_META[activeKpi].statusFilter ?? '_todos'); setFilterFornecedor('_todos'); setFilterMes('_todos') }}
                    className="h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                  >
                    <X className="w-3 h-3" /> Limpar filtros
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {reportRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-[var(--text-3)]">
                  <Package className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-sm">Nenhum registro encontrado</p>
                </div>
              ) : (
                <>
                  {/* Table header */}
                  <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1.5fr_1.2fr] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-[var(--text-3)] border-b" style={{ borderColor: 'var(--border)' }}>
                    <span>Solicitação</span>
                    <span>Data</span>
                    <span>Fornecedor</span>
                    <span className="text-center">Itens</span>
                    <span className="text-right">Valor Total</span>
                    <span className="text-center">Status</span>
                  </div>

                  <div className="divide-y divide-[var(--border)]">
                    {reportRows.map(sol => {
                      const cfg = STATUS_CONFIG[sol.status] ?? STATUS_CONFIG.rascunho
                      const nfTotal = (sol.notas_fiscais || []).filter(n => n.status !== 'rejeitada').reduce((s, n) => s + n.valor, 0)
                      return (
                        <Link key={sol.id} href={`/contratos/${id}/fat-direto/${sol.id}`} className="block">
                          <div className="grid grid-cols-[2fr_1fr_2fr_1fr_1.5fr_1.2fr] gap-3 px-5 py-3 items-center hover:bg-[var(--surface-2)] transition-colors text-sm">
                            <span className="font-semibold" style={{ color: 'var(--text-1)' }}>
                              SOL-{String(sol.numero).padStart(3, '0')}
                            </span>
                            <span className="text-xs text-[var(--text-3)]">{formatDate(sol.data_solicitacao)}</span>
                            <div className="min-w-0">
                              <span className="truncate block text-xs" style={{ color: 'var(--text-2)' }}>
                                {sol.fornecedor_razao_social || sol.solicitante?.nome || '—'}
                              </span>
                              {sol.fornecedor_cnpj && (
                                <span className="text-[10px] text-[var(--text-3)]">{sol.fornecedor_cnpj}</span>
                              )}
                            </div>
                            <span className="text-center text-xs text-[var(--text-3)]">
                              {sol.itens?.length ?? 0}
                            </span>
                            <div className="text-right">
                              <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{formatCurrency(sol.valor_total)}</p>
                              {nfTotal > 0 && (
                                <p className="text-[10px] text-[#06B6D4]">NF: {formatCurrency(nfTotal)}</p>
                              )}
                            </div>
                            <div className="flex justify-center">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 whitespace-nowrap"
                                style={{ background: `${cfg.color}20`, color: cfg.color }}
                              >
                                {cfg.icon} {cfg.label}
                              </span>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>

                  {/* Footer total */}
                  <div className="flex justify-between items-center px-5 py-3 border-t" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                    <span className="text-xs text-[var(--text-3)] font-medium">{reportRows.length} solicitação(ões)</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[var(--text-3)]">Total:</span>
                      <span className="text-base font-bold" style={{ color: KPI_META[activeKpi].color }}>{formatCurrency(reportTotal)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Solicitations list */}
        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base" style={{ color: 'var(--text-1)' }}>Solicitações de Autorização</CardTitle>
              {solicitacoes.length > 0 && (
                <span className="text-xs text-[var(--text-3)]">{solicitacoes.length} registro(s)</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">Carregando...</div>
            ) : solicitacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)]">
                <Package className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma solicitação encontrada</p>
                <Link href={`/contratos/${id}/fat-direto/nova`} className="mt-3">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="w-3 h-3" /> Nova Solicitação
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                {/* Sortable column headers */}
                <div className="grid grid-cols-[auto_1fr_1fr_auto_auto] gap-2 px-5 py-2 border-b text-[10px] font-bold uppercase tracking-wider select-none" style={{ borderColor: 'var(--border)', color: 'var(--text-3)' }}>
                  <button className="flex items-center gap-1 hover:text-[var(--text-1)] transition-colors" onClick={() => toggleSort('numero')}>
                    Nº <SortIcon col="numero" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-[var(--text-1)] transition-colors" onClick={() => toggleSort('fornecedor')}>
                    Fornecedor <SortIcon col="fornecedor" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-[var(--text-1)] transition-colors" onClick={() => toggleSort('data_solicitacao')}>
                    Data <SortIcon col="data_solicitacao" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-[var(--text-1)] transition-colors justify-end" onClick={() => toggleSort('valor_total')}>
                    Valor <SortIcon col="valor_total" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-[var(--text-1)] transition-colors justify-end" onClick={() => toggleSort('status')}>
                    Status <SortIcon col="status" />
                  </button>
                </div>

                <div className="divide-y divide-[var(--border)]">
                  {sortedSolicitacoes.map(sol => {
                    const cfg = STATUS_CONFIG[sol.status] ?? STATUS_CONFIG.rascunho
                    const nfTotal = (sol.notas_fiscais || []).filter(n => n.status !== 'rejeitada').reduce((s, n) => s + n.valor, 0)
                    return (
                      <Link key={sol.id} href={`/contratos/${id}/fat-direto/${sol.id}`} className="block">
                        <div className="px-5 py-4 hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
                            >
                              <span style={{ color: cfg.color }}>{cfg.icon}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                                  SOL-{String(sol.numero).padStart(3, '0')}
                                </span>
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                                  style={{ background: `${cfg.color}20`, color: cfg.color }}
                                >
                                  {cfg.icon} {cfg.label}
                                </span>
                                {isAdmin && sol.status === 'aprovado' && (
                                  <button
                                    onClick={e => desaprovar(e, sol.id)}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                                  >
                                    Desaprovar
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-[var(--text-3)] mt-0.5">
                                {sol.fornecedor_razao_social
                                  ? <span className="text-[var(--text-2)]">{sol.fornecedor_razao_social}</span>
                                  : sol.solicitante?.nome
                                }
                                {' · '}{formatDate(sol.data_solicitacao)}
                                {sol.itens && ` · ${sol.itens.length} item(s)`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{formatCurrency(sol.valor_total)}</p>
                            {nfTotal > 0 && (
                              <p className="text-xs text-[#06B6D4]">NF: {formatCurrency(nfTotal)}</p>
                            )}
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
