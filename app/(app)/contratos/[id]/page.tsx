'use client'

import { use, useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts'
import {
  ArrowLeft, Plus, FileText, Loader2, Pencil,
  ChevronRight, ChevronDown, Layers, ArrowUpDown, Filter, Package, TrendingUp,
  DollarSign, CheckCircle2, Wallet, ClipboardList, Search, X, Maximize2
} from 'lucide-react'
import { EditarContratoModal } from '@/components/contratos/editar-contrato-modal'
import {
  formatCurrency, formatPercent, formatDate,
  getContratoStatusColor, getMedicaoStatusColor
} from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, CONTRATO_TIPO_LABELS, MEDICAO_STATUS_LABELS, MedicaoStatus, ContratoTipo } from '@/types'

interface Contrato {
  id: string
  numero: string
  descricao: string
  escopo: string
  objeto: string
  contratante: { nome: string; cnpj: string }
  contratado: { nome: string; cnpj: string }
  tipo: string
  status: string
  valor_total?: number
  valor_contratado?: number
  valor_servicos?: number
  valor_material_direto?: number
  data_inicio: string
  data_fim: string
  local_obra: string
  fiscal_obra: string
  email_fiscal: string
  valor_medido?: number
  saldo?: number
  percentual_medido?: number
  qtd_medicoes_aprovadas?: number
  qtd_medicoes_pendentes?: number
}

interface Detalhamento {
  id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_contratada: number
  valor_unitario: number
  valor_total: number
  valor_material_unit?: number
  valor_servico_unit?: number
  subtotal_material?: number
  subtotal_mo?: number
  local?: string
  disciplina?: string
}

interface Tarefa {
  id: string
  codigo: string
  nome: string
  valor_contratado: number
  valor_total?: number
  valor_material?: number
  valor_servico?: number
  disciplina?: string
  detalhamentos?: Detalhamento[]
}

interface Grupo {
  id: string
  codigo: string
  nome: string
  tipo_medicao: string
  valor_contratado: number
  valor_material: number
  valor_servico: number
  valor_medido: number
  valor_saldo?: number
  percentual_medido?: number
  tarefas?: Tarefa[]
}

interface Medicao {
  id: string
  numero: number
  periodo_referencia: string
  tipo: string
  status: string
  valor_total: number
  solicitante_nome: string
  data_submissao?: string
  data_aprovacao?: string
}

interface Aditivo {
  id: string
}

export default function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [activeTab, setActiveTab] = useState('visao-geral')
  const [showMedidoResumo, setShowMedidoResumo] = useState(false)
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [aditivos, setAditivos] = useState<Aditivo[]>([])
  const [sortBy, setSortBy] = useState<'padrao' | 'valor_global_desc' | 'valor_global_asc' | 'valor_medido_desc' | 'valor_medido_asc' | 'saldo_desc' | 'saldo_asc'>('padrao')
  const [viewMode, setViewMode] = useState<'total' | 'material' | 'servico'>('total')
  const [fullscreenChart, setFullscreenChart] = useState<'bar' | 'pedidos' | null>(null)
  const [filtroGrupo, setFiltroGrupo] = useState<'todos' | string>('todos')

  // Estrutura detalhada state
  const [estruturaBusca, setEstruturaBusca] = useState('')
  const [estruturaNivel, setEstruturaNivel] = useState<'todos' | '1' | '2' | '3'>('todos')
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set())
  const [expandedTarefas, setExpandedTarefas] = useState<Set<string>>(new Set())
  // Modal editar contrato
  const [showEditar, setShowEditar] = useState(false)
  const [contratante, setContratante] = useState<any>(null)
  const [contratado, setContratado] = useState<any>(null)

  // Carrega empresas contratante/contratado quando o modal abre
  useEffect(() => {
    if (!showEditar || !contrato) return
    const contratanteId = (contrato as any).contratante_id
    const contratadoId  = (contrato as any).contratado_id
    if (contratanteId) {
      fetch(`/api/empresas/${contratanteId}`).then(r => r.json()).then(setContratante).catch(() => setContratante(null))
    }
    if (contratadoId) {
      fetch(`/api/empresas/${contratadoId}`).then(r => r.json()).then(setContratado).catch(() => setContratado(null))
    }
  }, [showEditar, contrato])

  function toggleGrupo(id: string) {
    setExpandedGrupos(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleTarefa(id: string) {
    setExpandedTarefas(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function expandAll() {
    setExpandedGrupos(new Set(grupos.map(g => g.id)))
    setExpandedTarefas(new Set(grupos.flatMap(g => (g.tarefas || []).map(t => t.id))))
  }
  function collapseAll() { setExpandedGrupos(new Set()); setExpandedTarefas(new Set()) }


  useEffect(() => {
    async function loadContrato() {
      try {
        const res = await fetch(`/api/contratos/${id}`)
        if (res.ok) {
          const data = await res.json()
          setContrato(data)
        }
      } finally {
        setLoading(false)
      }
    }
    loadContrato()
  }, [id])

  useEffect(() => {
    async function loadGrupos() {
      const res = await fetch(`/api/contratos/${id}/grupos`)
      if (res.ok) {
        const data = await res.json()
        setGrupos(data)
      }
    }
    loadGrupos()
  }, [id])

  useEffect(() => {
    async function loadMedicoes() {
      const res = await fetch(`/api/contratos/${id}/medicoes`)
      if (res.ok) {
        const data = await res.json()
        setMedicoes(data)
      }
    }
    loadMedicoes()
  }, [id])

  useEffect(() => {
    async function loadAditivos() {
      const res = await fetch(`/api/contratos/${id}/aditivos`)
      if (res.ok) {
        const data = await res.json()
        setAditivos(data)
      }
    }
    loadAditivos()
  }, [id])


  const TIPO_MEDICAO_COLORS: Record<string, string> = {
    servico: 'bg-purple-900/30 text-purple-400 border-purple-800/50',
    faturamento_direto: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
    misto: 'bg-teal-900/30 text-teal-400 border-teal-800/50',
  }
  const TIPO_MEDICAO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Material',
    misto: 'Total',
  }

  // Retorna o valor contratado do grupo conforme modo de visualização
  const getValorView = (g: Grupo) => viewMode === 'material' ? (g.valor_material ?? 0) : viewMode === 'servico' ? (g.valor_servico ?? 0) : g.valor_contratado

  const gruposExibidos = useMemo(() => {
    let list = filtroGrupo === 'todos' ? [...grupos] : grupos.filter(g => g.id === filtroGrupo)
    list.sort((a, b) => {
      const va = viewMode === 'material' ? (a.valor_material ?? 0) : viewMode === 'servico' ? (a.valor_servico ?? 0) : a.valor_contratado
      const vb = viewMode === 'material' ? (b.valor_material ?? 0) : viewMode === 'servico' ? (b.valor_servico ?? 0) : b.valor_contratado
      switch (sortBy) {
        case 'padrao': return parseFloat(a.codigo) - parseFloat(b.codigo)
        case 'valor_global_desc': return vb - va
        case 'valor_global_asc': return va - vb
        case 'valor_medido_desc': return (b.valor_medido ?? 0) - (a.valor_medido ?? 0)
        case 'valor_medido_asc': return (a.valor_medido ?? 0) - (b.valor_medido ?? 0)
        case 'saldo_desc': return (vb - (b.valor_medido ?? 0)) - (va - (a.valor_medido ?? 0))
        case 'saldo_asc': return (va - (a.valor_medido ?? 0)) - (vb - (b.valor_medido ?? 0))
        default: return parseFloat(a.codigo) - parseFloat(b.codigo)
      }
    })
    return list
  }, [grupos, sortBy, viewMode, filtroGrupo])

  // Gráfico sempre em ordem 1.0→19.0 e sem filtro de tipo (mostra tudo)
  const gruposOrdenados = useMemo(() =>
    [...grupos].sort((a, b) => parseFloat(a.codigo) - parseFloat(b.codigo)),
    [grupos]
  )

  // Paleta de cores por grupo (índice na ordem código 1.0 → 19.0)
  const GROUP_PALETTE = [
    '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444',
    '#06B6D4', '#EC4899', '#F97316', '#14B8A6', '#6366F1',
    '#84CC16', '#A855F7', '#FB923C', '#34D399', '#FBBF24',
    '#38BDF8', '#E879F9', '#4ADE80', '#FCA5A5', '#93C5FD',
  ]

  const groupColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    gruposOrdenados.forEach((g, i) => { map[g.id] = GROUP_PALETTE[i % GROUP_PALETTE.length] })
    return map
  }, [gruposOrdenados])

  if (loading) {
    return (
      <div className="flex-1">
        <Topbar title="Carregando..." subtitle="" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="flex-1">
        <Topbar title="Contrato não encontrado" subtitle="" />
        <div className="p-3 sm:p-6">
          <Link href="/contratos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const valorTotal = contrato.valor_total || contrato.valor_contratado || 0
  const valorMedido = contrato.valor_medido ?? 0
  const saldo = contrato.saldo ?? 0
  const percentualMedido = contrato.percentual_medido ?? 0
  const qtdAprovadas = contrato.qtd_medicoes_aprovadas ?? 0
  const qtdPendentes = contrato.qtd_medicoes_pendentes ?? 0

  const VIEW_MODE_LABELS: Record<string, string> = { total: 'Total', material: 'Material', servico: 'Serviço' }
  const gruposChart = gruposOrdenados.map((g, i) => {
    const vContratado = getValorView(g)
    return {
      nome: g.codigo,   // eixo Y mostra apenas o código (ex: 1.0, 2.0…)
      nomeFull: g.nome, // tooltip mostra o nome completo
      contratado: vContratado,
      medido: g.valor_medido,
      saldo: vContratado - g.valor_medido,
      color: GROUP_PALETTE[i % GROUP_PALETTE.length],
    }
  })

  return (
    <div className="flex-1">
      <Topbar
        title={
          <span className="flex items-center gap-2">
            {contrato.numero}
            <Badge className={getContratoStatusColor(contrato.status as any)}>
              {CONTRATO_STATUS_LABELS[contrato.status as keyof typeof CONTRATO_STATUS_LABELS]}
            </Badge>
          </span>
        }
        subtitle={contrato.descricao}
        actions={
          <div className="flex gap-1 sm:gap-2 flex-wrap">
            <Link href="/contratos">
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#475569', color: '#f1f5f9' }}>
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Contratos</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/cronograma`}>
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#b45309', color: '#fef3c7' }}>
                <span className="hidden sm:inline">Cronograma</span>
                <span className="sm:hidden text-xs">Cron.</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="ghost" size="sm" className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110" style={{ background: '#0f766e', color: '#ccfbf1' }}>
                <span className="hidden sm:inline">Fat. Direto</span>
                <span className="sm:hidden text-xs">Fat.</span>
              </Button>
            </Link>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3 font-semibold hover:brightness-110" style={{ background: '#1d4ed8', color: '#eff6ff' }}>
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                <span className="hidden sm:inline">Med. Serviços</span>
                <span className="sm:hidden text-xs">Med.</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEditar(true)}
              className="px-2 sm:px-3 gap-1 font-semibold hover:brightness-110"
              style={{ background: '#6d28d9', color: '#ede9fe' }}
            >
              <Pencil className="w-4 h-4" strokeWidth={1.5} />
              <span className="hidden sm:inline ml-1">Editar</span>
            </Button>
          </div>
        }
      />

      {/* ── Sticky KPI bar ── */}
      <div className="sticky top-14 z-10 px-3 sm:px-6 py-3 border-b" style={{ background: 'var(--background)', borderColor: 'var(--border)' }}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* KPI: Valor Total → abre Estrutura */}
          <div onClick={() => setActiveTab('estrutura')} className="cursor-pointer">
            <Card className="group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Valor Total</p>
                  <div className="w-9 h-9 rounded-xl kpi-icon-blue flex items-center justify-center transition-all" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                    <DollarSign className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(valorTotal)}</p>
                <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <span>Serv: {formatCurrency(contrato.valor_servicos ?? 0)}</span>
                  <span>Mat: {formatCurrency(contrato.valor_material_direto ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Medido → abre resumo Fat Direto + Medições */}
          <div onClick={() => setShowMedidoResumo(true)} className="cursor-pointer">
            <Card className="group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medido</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <TrendingUp className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(valorMedido)}</p>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(percentualMedido, 100)}%`, background: 'linear-gradient(90deg, #059669, #10B981)', boxShadow: percentualMedido > 0 ? '0 0 6px rgba(16,185,129,0.4)' : 'none' }}
                    />
                  </div>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--green)' }}>{formatPercent(percentualMedido)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Saldo — sem link */}
          <div>
            <Card className="transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Saldo</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                    <Wallet className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--text-2)' }} />
                  </div>
                </div>
                <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(saldo)}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{formatPercent(100 - percentualMedido)} restante do contrato</p>
              </CardContent>
            </Card>
          </div>

          {/* KPI: Medições → Aprovações */}
          <Link href="/aprovacoes">
            <Card className="cursor-pointer group transition-all theme-card">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medições</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: qtdPendentes > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(6,182,212,0.10)', border: `1px solid ${qtdPendentes > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(6,182,212,0.20)'}` }}>
                    <ClipboardList className="w-4 h-4" strokeWidth={1.5} style={{ color: qtdPendentes > 0 ? 'var(--amber)' : '#06B6D4' }} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{qtdAprovadas}</p>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>aprovadas</p>
                </div>
                {qtdPendentes > 0
                  ? <p className="text-xs mt-1 font-semibold flex items-center gap-1" style={{ color: 'var(--amber)' }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--amber)' }} />
                      {qtdPendentes} aguardando aprovação
                    </p>
                  : <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>nenhuma pendente</p>
                }
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* Tabs */}
        {/* Resumo Medido - popup */}
        {showMedidoResumo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowMedidoResumo(false)}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-md mx-4 rounded-2xl p-6 space-y-4"
              style={{ background: '#FFFFFF', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold" style={{ color: 'var(--text-1)' }}>Resumo do Faturamento</h3>
                <button onClick={() => setShowMedidoResumo(false)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#F5F5F7', color: '#86868B' }}>
                  <span className="text-sm font-bold">x</span>
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-xl" style={{ background: '#F5F5F7' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#86868B' }}>Total Medido</p>
                  <p className="text-base sm:text-2xl font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(valorMedido)}</p>
                  <p className="text-xs mt-1" style={{ color: '#86868B' }}>{formatPercent(percentualMedido)} do contrato</p>
                </div>

                <Link href={`/contratos/${id}/medicoes`} onClick={() => setShowMedidoResumo(false)}>
                  <div className="p-4 rounded-xl cursor-pointer transition-all" style={{ border: '1px solid rgba(0,0,0,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Medições de Serviço</p>
                        <p className="text-xs mt-0.5" style={{ color: '#86868B' }}>{medicoes.length} medição(ões) registrada(s)</p>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#86868B' }} />
                    </div>
                  </div>
                </Link>

                <Link href={`/contratos/${id}/fat-direto`} onClick={() => setShowMedidoResumo(false)}>
                  <div className="p-4 rounded-xl cursor-pointer transition-all" style={{ border: '1px solid rgba(0,0,0,0.06)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F7' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Faturamento Direto</p>
                        <p className="text-xs mt-0.5" style={{ color: '#86868B' }}>Material direto autorizado</p>
                      </div>
                      <ChevronRight className="w-4 h-4" style={{ color: '#86868B' }} />
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}

        {fullscreenChart && (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--background)' }}>
            <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-4">
                <h2 className="text-base font-bold" style={{ color: 'var(--text-1)' }}>
                  {fullscreenChart === 'bar' ? 'Medição de Serviço' : 'Pedidos Aprovados'}
                </h2>
                {fullscreenChart === 'bar' && (
                  <div className="flex gap-2">
                    {(['total', 'material', 'servico'] as const).map(m => (
                      <button key={m} onClick={() => setViewMode(m)}
                        className="text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                        style={{
                          background: viewMode === m ? 'var(--accent)' : 'var(--surface-2)',
                          color: viewMode === m ? '#fff' : 'var(--text-2)',
                          border: `1px solid ${viewMode === m ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                        {VIEW_MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                )}
                {fullscreenChart === 'pedidos' && (
                  <div className="flex gap-2">
                    {(['total', 'material', 'servico'] as const).map(m => (
                      <button key={m} onClick={() => setViewMode(m)}
                        className="text-xs px-3 py-1 rounded-lg font-medium transition-colors"
                        style={{
                          background: viewMode === m ? 'var(--accent)' : 'var(--surface-2)',
                          color: viewMode === m ? '#fff' : 'var(--text-2)',
                          border: `1px solid ${viewMode === m ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                        {VIEW_MODE_LABELS[m]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setFullscreenChart(null)} className="p-2 rounded-lg hover:bg-[var(--surface-2)]">
                <X className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
              </button>
            </div>
            <div className="flex-1 p-6">
              {fullscreenChart === 'bar' && (
                <ResponsiveContainer width="100%" height={Math.max(600, gruposChart.length * 42)}>
                  <BarChart data={gruposChart} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: 'var(--text-2)' }} width={40} axisLine={false} tickLine={false} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0]?.payload
                      const color = d?.color ?? '#3B82F6'
                      return (
                        <div style={{ background: '#0D1421', border: `1px solid ${color}60`, borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 200 }}>
                          <p style={{ color, fontWeight: 700, marginBottom: 6 }}>{d?.nomeFull}</p>
                          {payload.map((p: any) => (
                            <p key={p.dataKey} style={{ color: '#FFFFFF', margin: '2px 0' }}>{p.name}: {formatCurrency(p.value as number)}</p>
                          ))}
                        </div>
                      )
                    }} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)' }} />
                    <Bar dataKey="contratado" name="Contratado" radius={[0, 3, 3, 0]} maxBarSize={14}>
                      {gruposChart.map((entry, i) => <Cell key={i} fill={`${entry.color}BB`} />)}
                    </Bar>
                    <Bar dataKey="medido" name="Medido" radius={[0, 3, 3, 0]} maxBarSize={14}>
                      {gruposChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {fullscreenChart === 'pedidos' && (
                <div className="max-w-3xl mx-auto space-y-4">
                  {gruposExibidos.map(g => {
                    const vBase = getValorView(g)
                    const pct = vBase > 0 ? (g.valor_medido / vBase) * 100 : 0
                    const color = groupColorMap[g.id] ?? '#3B82F6'
                    return (
                      <div key={g.id}>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-bold flex-shrink-0" style={{ color }}>{g.codigo}</span>
                            <span className="text-sm font-medium text-[var(--text-2)] truncate">{g.nome}</span>
                          </div>
                          <span className="text-sm font-bold flex-shrink-0 ml-2" style={{ color }}>{formatPercent(pct)}</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                        </div>
                        <div className="flex justify-between text-xs text-[var(--text-3)] mt-0.5">
                          <span>{VIEW_MODE_LABELS[viewMode]}: {formatCurrency(vBase)}</span>
                          <span>Medido: {formatCurrency(g.valor_medido ?? 0)}</span>
                          <span>Saldo: {formatCurrency(vBase - (g.valor_medido ?? 0))}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="dados">Dados do Contrato</TabsTrigger>
            <TabsTrigger value="medicoes">Medições</TabsTrigger>
            <TabsTrigger value="fat-direto-tab">FAT. DIRETO</TabsTrigger>
            <TabsTrigger value="cronograma-tab">CRONOGRAMA</TabsTrigger>
            <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
            <TabsTrigger value="aditivos">Aditivos {aditivos.length > 0 && `(${aditivos.length})`}</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Chart grupos — Medição de Serviço */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm text-[var(--text-2)]">Medição de Serviço</CardTitle>
                  <button onClick={() => setFullscreenChart('bar')} className="p-1 rounded hover:bg-[var(--surface-3)]" title="Tela cheia">
                    <Maximize2 className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                  </button>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(320, gruposChart.length * 32)}>
                    <BarChart data={gruposChart} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: 'var(--text-2)' }} width={36} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const d = payload[0]?.payload
                          const color = d?.color ?? '#3B82F6'
                          return (
                            <div style={{ background: '#0D1421', border: `1px solid ${color}60`, borderRadius: 8, padding: '8px 12px', fontSize: 12, minWidth: 180 }}>
                              <p style={{ color, fontWeight: 700, marginBottom: 6, fontSize: 11 }}>{d?.nomeFull}</p>
                              {payload.map((p: any) => (
                                <p key={p.dataKey} style={{ color: '#FFFFFF', margin: '2px 0' }}>
                                  {p.name}: {formatCurrency(p.value as number)}
                                </p>
                              ))}
                            </div>
                          )
                        }}
                      />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }} />
                      <Bar dataKey="contratado" name="Contratado" radius={[0, 2, 2, 0]} maxBarSize={10}>
                        {gruposChart.map((entry, i) => (
                          <Cell key={i} fill={`${entry.color}BB`} />
                        ))}
                      </Bar>
                      <Bar dataKey="medido" name="Medido" radius={[0, 2, 2, 0]} maxBarSize={10}>
                        {gruposChart.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grupos progress — Pedidos Aprovados */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm text-[var(--text-2)]">Pedidos Aprovados</CardTitle>
                      <button onClick={() => setFullscreenChart('pedidos')} className="p-1 rounded hover:bg-[var(--surface-3)]" title="Tela cheia">
                        <Maximize2 className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                      </button>
                    </div>
                    {/* Controles inline */}
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Select value={filtroGrupo} onValueChange={v => setFiltroGrupo(v)}>
                        <SelectTrigger className="h-7 text-[11px] w-44 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                          <SelectValue placeholder="Todos os grupos" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos os grupos</SelectItem>
                          {gruposOrdenados.map(g => (
                            <SelectItem key={g.id} value={g.id}>{g.codigo} — {g.nome.substring(0, 30)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                        <SelectTrigger className="h-7 text-[11px] w-48 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                          <ArrowUpDown className="w-3 h-3 mr-1 flex-shrink-0" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="padrao">Padrão (1.0 → 19.0)</SelectItem>
                          <SelectItem value="valor_global_desc">Valor ↓</SelectItem>
                          <SelectItem value="valor_global_asc">Valor ↑</SelectItem>
                          <SelectItem value="valor_medido_desc">Medido ↓</SelectItem>
                          <SelectItem value="valor_medido_asc">Medido ↑</SelectItem>
                          <SelectItem value="saldo_desc">Saldo ↓</SelectItem>
                          <SelectItem value="saldo_asc">Saldo ↑</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)}>
                        <SelectTrigger className="h-7 text-[11px] w-36 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                          <Filter className="w-3 h-3 mr-1 flex-shrink-0" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="total">Total</SelectItem>
                          <SelectItem value="material">Material</SelectItem>
                          <SelectItem value="servico">Serviço</SelectItem>
                        </SelectContent>
                      </Select>
                      {(sortBy !== 'padrao' || viewMode !== 'total' || filtroGrupo !== 'todos') && (
                        <button
                          onClick={() => { setSortBy('padrao'); setViewMode('total'); setFiltroGrupo('todos') }}
                          className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2"
                        >
                          Limpar
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[360px] overflow-y-auto">
                  {gruposExibidos.map(g => {
                    const vBase = getValorView(g)
                    const pct = vBase > 0 ? (g.valor_medido / vBase) * 100 : 0
                    const color = groupColorMap[g.id] ?? '#3B82F6'
                    return (
                      <div key={g.id}>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold flex-shrink-0" style={{ color }}>{g.codigo}</span>
                            <span className="text-xs font-medium text-[var(--text-2)] truncate">{g.nome}</span>
                          </div>
                          <span className="text-xs font-bold flex-shrink-0 ml-2" style={{ color }}>{formatPercent(pct)}</span>
                        </div>
                        {/* Progress bar com cor do grupo */}
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--text-3)] mt-0.5">
                          <span>{VIEW_MODE_LABELS[viewMode]}: {formatCurrency(vBase)}</span>
                          <span>Medido: {formatCurrency(g.valor_medido ?? 0)}</span>
                          <span>Saldo: {formatCurrency(vBase - (g.valor_medido ?? 0))}</span>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>

          </TabsContent>

          {/* Medições */}
          <TabsContent value="medicoes">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-[var(--text-2)]">{medicoes.length} medição(ões) registrada(s)</p>
              <Link href={`/contratos/${id}/medicoes/nova`}>
                <Button size="sm">
                  <Plus className="w-4 h-4" />
                  Nova Medição
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {medicoes.map(m => (
                <Link key={m.id} href={`/contratos/${id}/medicoes/${m.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-blue-400/60 font-medium">MED</span>
                          <span className="text-base font-bold text-blue-400 leading-tight">#{String(m.numero).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-[var(--text-1)]">Medição {m.periodo_referencia}</span>
                            <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                            </Badge>
                            <Badge className={TIPO_MEDICAO_COLORS[m.tipo]}>
                              {TIPO_MEDICAO_LABELS[m.tipo]}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--text-3)]">Solicitante: {m.solicitante_nome}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-[var(--text-1)]">{formatCurrency(m.valor_total)}</p>
                          <p className="text-xs text-[var(--text-3)] mt-0.5">
                            {m.status === 'aprovado' && m.data_aprovacao
                              ? `Aprovado em ${formatDate(m.data_aprovacao)}`
                              : m.data_submissao
                              ? `Submetido em ${formatDate(m.data_submissao)}`
                              : ''
                            }
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          {/* Estrutura — orçamento detalhado nível 1→3 */}
          <TabsContent value="estrutura">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {/* Search */}
              <div className="relative flex-1 min-w-48 max-w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-3)]" strokeWidth={1.5} />
                <input
                  type="text"
                  value={estruturaBusca}
                  onChange={e => setEstruturaBusca(e.target.value)}
                  placeholder="Buscar código ou descrição..."
                  className="w-full h-8 pl-8 pr-8 text-xs rounded-lg outline-none"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
                {estruturaBusca && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setEstruturaBusca('')}>
                    <X className="w-3 h-3 text-[var(--text-3)]" />
                  </button>
                )}
              </div>

              {/* Level filter */}
              <Select value={estruturaNivel} onValueChange={v => setEstruturaNivel(v as typeof estruturaNivel)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os níveis</SelectItem>
                  <SelectItem value="1">Nível 1 — Grupos</SelectItem>
                  <SelectItem value="2">Nível 2 — Serviços</SelectItem>
                  <SelectItem value="3">Nível 3 — Itens</SelectItem>
                </SelectContent>
              </Select>

              {/* View mode */}
              <Select value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)}>
                <SelectTrigger className="h-8 text-xs w-32 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex gap-1 ml-auto">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>Expandir tudo</Button>
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>Recolher</Button>
                <Link href={`/contratos/${id}/estrutura`}>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    <Layers className="w-3.5 h-3.5" /> Gerenciar
                  </Button>
                </Link>
              </div>
            </div>

            {/* Detalhamento — cards por grupo com colunas completas (Cód/Descrição/Local/Qtde/Unid/PR Mat/PR MO/Subt Mat/Subt MO/Total) */}
            {(() => {
              const busca = estruturaBusca.toLowerCase()
              const colMatActive = viewMode === 'material'
              const colMoActive = viewMode === 'servico'

              // Monta lista filtrada + acumula subtotais visíveis
              let subtotalTotal = 0
              let subtotalMat = 0
              let subtotalMo = 0
              let visibleDetCount = 0

              const cards: React.ReactNode[] = []

              gruposExibidos.forEach(g => {
                const tarefas = g.tarefas || []
                const grupoMatchBusca = !busca || g.codigo.toLowerCase().includes(busca) || g.nome.toLowerCase().includes(busca)
                const anyTarefaMatch = tarefas.some(t =>
                  t.codigo.toLowerCase().includes(busca) || t.nome.toLowerCase().includes(busca) ||
                  (t.detalhamentos || []).some(d => d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca))
                )
                if (busca && !grupoMatchBusca && !anyTarefaMatch) return

                // Filtro por nivel: '1' apenas grupos (header sem expandir), '2' força recolher detalhamentos,
                // '3' força expandir tarefas; 'todos' respeita expansão do usuário
                const isGrupoExpanded = estruturaNivel === '1'
                  ? false
                  : (estruturaNivel === '2' || estruturaNivel === '3' || busca.length > 0 || expandedGrupos.has(g.id))

                const vGrupo = getValorView(g)
                const saldoGrupo = vGrupo - (g.valor_medido ?? 0)
                const pctMedido = vGrupo > 0 ? ((g.valor_medido ?? 0) / vGrupo) * 100 : 0

                cards.push(
                  <Card key={g.id} className="theme-card">
                    <CardContent className="p-0">
                      {/* Cabeçalho do grupo */}
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--surface-1)] transition-colors"
                        onClick={() => toggleGrupo(g.id)}
                      >
                        {isGrupoExpanded
                          ? <ChevronDown className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-[var(--text-3)] flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-mono text-xs text-[var(--text-3)]">{g.codigo}</span>
                            <span className="font-bold text-[var(--text-1)] truncate">{g.nome}</span>
                            <Badge className={TIPO_MEDICAO_COLORS[g.tipo_medicao] || ''}>
                              {TIPO_MEDICAO_LABELS[g.tipo_medicao] || g.tipo_medicao}
                            </Badge>
                            <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--accent)' }}>
                              {tarefas.length} serv.
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Progress value={Math.min(pctMedido, 100)} className="h-1.5 w-48" />
                            <span className="text-xs text-[var(--text-3)]">{formatPercent(pctMedido)} medido</span>
                          </div>
                        </div>
                        <div className="text-right text-sm min-w-[160px] flex-shrink-0">
                          <p className="font-bold text-[var(--text-1)]">{formatCurrency(vGrupo)}</p>
                          <p className="text-xs text-[var(--text-3)]">Medido: {formatCurrency(g.valor_medido ?? 0)}</p>
                          <p className="text-xs text-emerald-500/80">Saldo: {formatCurrency(saldoGrupo)}</p>
                        </div>
                      </div>

                      {/* Tarefas + detalhamentos */}
                      {isGrupoExpanded && (
                        <div className="border-t border-[var(--border)]">
                          {tarefas.map(t => {
                            const detalhamentos = t.detalhamentos || []
                            const tarefaMatchBusca = !busca || t.codigo.toLowerCase().includes(busca) || t.nome.toLowerCase().includes(busca) ||
                              detalhamentos.some(d => d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca))
                            if (busca && !grupoMatchBusca && !tarefaMatchBusca) return null

                            const isTarefaExpanded = estruturaNivel === '3' || estruturaNivel === 'todos'
                              ? (busca.length > 0 || expandedTarefas.has(t.id))
                              : false

                            const valorTarefa = t.valor_total ?? t.valor_contratado ?? 0

                            return (
                              <div key={t.id} className="border-b border-[var(--border)] last:border-0">
                                <div
                                  className="flex items-center gap-3 px-8 py-3 bg-[var(--surface-1)] cursor-pointer hover:bg-[var(--surface-2)]"
                                  onClick={() => toggleTarefa(t.id)}
                                >
                                  {detalhamentos.length > 0 ? (
                                    isTarefaExpanded
                                      ? <ChevronDown className="w-3.5 h-3.5 text-[var(--text-3)] flex-shrink-0" />
                                      : <ChevronRight className="w-3.5 h-3.5 text-[var(--text-3)] flex-shrink-0" />
                                  ) : <span className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <span className="font-mono text-xs text-[var(--text-3)]">{t.codigo}</span>
                                  <span className="font-semibold text-sm text-[var(--text-2)] flex-1 truncate">{t.nome}</span>
                                  <span className="text-xs font-medium text-[var(--text-2)]">{formatCurrency(valorTarefa)}</span>
                                </div>

                                {/* Detalhamentos — 10 colunas conforme planilha oficial */}
                                {isTarefaExpanded && detalhamentos.length > 0 && (estruturaNivel === 'todos' || estruturaNivel === '3') && (
                                  <div className="px-12 py-2 overflow-x-auto">
                                    <div className="min-w-[980px]">
                                      <div className="grid grid-cols-[40px_1fr_80px_50px_40px_90px_90px_100px_100px_100px] gap-2 px-2 pb-1.5 mb-1 border-b border-[var(--border)]/40 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-3)]">
                                        <span>Cód.</span>
                                        <span>Descrição</span>
                                        <span>Local</span>
                                        <span className="text-right">Qtde</span>
                                        <span className="text-center">Unid</span>
                                        <span className="text-right">PR. Mat</span>
                                        <span className="text-right">PR. M.O.</span>
                                        <span className="text-right">Subt. Mat</span>
                                        <span className="text-right">Subt. M.O.</span>
                                        <span className="text-right">Total</span>
                                      </div>
                                      {detalhamentos.map(d => {
                                        const detMatch = !busca || d.codigo.toLowerCase().includes(busca) || d.descricao.toLowerCase().includes(busca) || tarefaMatchBusca || grupoMatchBusca
                                        if (busca && !detMatch) return null
                                        const qtd = Number(d.quantidade_contratada || 0)
                                        const prMat = Number(d.valor_material_unit ?? 0)
                                        const prMo = Number(d.valor_servico_unit ?? 0)
                                        const subMat = Number(d.subtotal_material ?? qtd * prMat)
                                        const subMo = Number(d.subtotal_mo ?? qtd * prMo)
                                        const total = d.valor_total || (subMat + subMo) || (qtd * (d.valor_unitario || 0))

                                        // acumula subtotais visíveis
                                        visibleDetCount += 1
                                        subtotalTotal += total
                                        subtotalMat += subMat
                                        subtotalMo += subMo

                                        return (
                                          <div key={d.id} className="grid grid-cols-[40px_1fr_80px_50px_40px_90px_90px_100px_100px_100px] gap-2 py-1.5 px-2 rounded hover:bg-[var(--surface-1)] text-xs items-center">
                                            <span className="font-mono text-[var(--text-3)]">{d.codigo}</span>
                                            <span className="text-[var(--text-2)] truncate" title={d.descricao}>{d.descricao}</span>
                                            <span className="text-[10px] text-[var(--text-3)] truncate" title={d.local || ''}>{d.local || '—'}</span>
                                            <span className="text-right tabular-nums text-[var(--text-2)]">{qtd.toLocaleString('pt-BR')}</span>
                                            <span className="text-center text-[var(--text-3)]">{d.unidade || 'UN'}</span>
                                            <span className={`text-right tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-3)]'}`}>{formatCurrency(prMat)}</span>
                                            <span className={`text-right tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-3)]'}`}>{formatCurrency(prMo)}</span>
                                            <span className={`text-right tabular-nums ${colMatActive ? 'font-semibold text-blue-400' : 'text-[var(--text-2)]'}`}>{formatCurrency(subMat)}</span>
                                            <span className={`text-right tabular-nums ${colMoActive ? 'font-semibold text-amber-400' : 'text-[var(--text-2)]'}`}>{formatCurrency(subMo)}</span>
                                            <span className="text-right tabular-nums font-semibold text-[var(--text-1)]">{formatCurrency(total)}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })

              if (cards.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)] rounded-xl" style={{ border: '1px solid var(--border)' }}>
                    <Package className="w-8 h-8 mb-2 opacity-30" />
                    <p className="text-sm">Nenhum item encontrado</p>
                  </div>
                )
              }

              const totalGrupos = gruposExibidos.reduce((s, g) => s + getValorView(g), 0)
              const isFiltering = busca.length > 0 || estruturaNivel !== 'todos' || filtroGrupo !== 'todos' || viewMode !== 'total'

              return (
                <div className="space-y-3">
                  {cards}

                  {/* Footer — TOTAL ORÇADO sempre + SUBTOTAL FILTRADO quando há filtro/busca */}
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)', background: 'var(--surface-3)' }}>
                    <div className="flex items-center justify-between px-4 py-3">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                        Total orçado ({gruposExibidos.length} grupo{gruposExibidos.length !== 1 ? 's' : ''})
                      </span>
                      <span className="text-sm font-black" style={{ color: 'var(--accent)' }}>
                        {formatCurrency(totalGrupos)}
                      </span>
                    </div>
                    {isFiltering && visibleDetCount > 0 && (
                      <div
                        className="px-4 py-3 border-t flex flex-wrap items-center justify-between gap-2"
                        style={{ borderColor: 'var(--border)', background: 'rgba(16,185,129,0.08)' }}
                      >
                        <div className="flex items-center gap-2">
                          <Filter className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-2)' }}>
                            Subtotal filtrado ({visibleDetCount} {visibleDetCount === 1 ? 'item' : 'itens'})
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-[var(--text-3)]">Mat: <span className="font-semibold text-blue-400">{formatCurrency(subtotalMat)}</span></span>
                          <span className="text-[var(--text-3)]">M.O.: <span className="font-semibold text-amber-400">{formatCurrency(subtotalMo)}</span></span>
                          <span className="text-sm font-black text-emerald-500">{formatCurrency(subtotalTotal)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
          </TabsContent>

          {/* FAT. DIRETO tab */}
          <TabsContent value="fat-direto-tab">
            <div className="flex justify-center py-8">
              <Link href={`/contratos/${id}/fat-direto`}>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Acessar Faturamento Direto
                </Button>
              </Link>
            </div>
          </TabsContent>

          {/* CRONOGRAMA tab */}
          <TabsContent value="cronograma-tab">
            <div className="flex justify-center py-8">
              <Link href={`/contratos/${id}/cronograma`}>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" />
                  Acessar Cronograma
                </Button>
              </Link>
            </div>
          </TabsContent>

          {/* Aditivos */}
          <TabsContent value="aditivos">
            <Link href={`/contratos/${id}/aditivos`}>
              <div className="flex justify-end mb-4">
                <Button size="sm">
                  <Plus className="w-4 h-4" />
                  Novo Aditivo
                </Button>
              </div>
            </Link>
            {aditivos.length === 0 ? (
              <div className="text-center py-12 text-[var(--text-3)]">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhum aditivo registrado</p>
                <p className="text-sm mt-1">Registre aditivos de valor, prazo ou escopo aqui</p>
              </div>
            ) : null}
          </TabsContent>

          {/* Dados */}
          <TabsContent value="dados">
            <Card>
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Número</p>
                    <p className="text-[var(--text-1)] font-medium">{contrato.numero}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Tipo</p>
                    <p className="text-[var(--text-1)]">{CONTRATO_TIPO_LABELS[contrato.tipo as ContratoTipo]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Contratante</p>
                    <p className="text-[var(--text-1)]">{contrato.contratado?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratado?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Contratada</p>
                    <p className="text-[var(--text-1)]">{contrato.contratante?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratante?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-[var(--text-1)]">{formatDate(contrato.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Término</p>
                    <p className="text-[var(--text-1)]">{formatDate(contrato.data_fim)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Local da Obra</p>
                    <p className="text-[var(--text-1)]">{contrato.local_obra}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Fiscal de Obra</p>
                    <p className="text-[var(--text-1)]">{contrato.fiscal_obra}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.email_fiscal}</p>
                  </div>
                  <div className="col-span-2 border-t border-[var(--border)] pt-3">
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Objeto</p>
                    <p className="text-[var(--text-2)]">{contrato.objeto}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal: editar dados contratuais */}
      {contrato && (
        <EditarContratoModal
          open={showEditar}
          onClose={() => setShowEditar(false)}
          contratoId={id}
          initial={{
            numero: contrato.numero,
            descricao: contrato.descricao,
            escopo: (contrato as any).escopo ?? null,
            objeto: (contrato as any).objeto ?? null,
            local_obra: (contrato as any).local_obra ?? null,
            fiscal_obra: (contrato as any).fiscal_obra ?? null,
            email_fiscal: (contrato as any).email_fiscal ?? null,
            data_inicio: (contrato as any).data_inicio ?? null,
            data_fim: (contrato as any).data_fim ?? null,
            status: contrato.status,
            observacoes: (contrato as any).observacoes ?? null,
            contratante: contratante ? {
              id: contratante.id,
              razao_social: contratante.razao_social,
              cnpj: contratante.cnpj,
              endereco: contratante.endereco,
              telefone: contratante.telefone,
              email: contratante.email,
            } : undefined,
            contratado: contratado ? {
              id: contratado.id,
              razao_social: contratado.razao_social,
              cnpj: contratado.cnpj,
              endereco: contratado.endereco,
              telefone: contratado.telefone,
              email: contratado.email,
            } : undefined,
          }}
          onSaved={() => {
            // Recarrega contrato na tela após salvar
            fetch(`/api/contratos/${id}`).then(r => r.json()).then(setContrato).catch(() => {})
          }}
        />
      )}
    </div>
  )
}
