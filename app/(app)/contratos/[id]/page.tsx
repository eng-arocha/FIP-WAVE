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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList
} from 'recharts'
import {
  ArrowLeft, Plus, FileText, Loader2,
  ChevronRight, Layers, ArrowUpDown, Filter, Package, TrendingUp,
  DollarSign, CheckCircle2, Wallet, ClipboardList
} from 'lucide-react'
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
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [aditivos, setAditivos] = useState<Aditivo[]>([])
  const [sortBy, setSortBy] = useState<'padrao' | 'valor_global_desc' | 'valor_global_asc' | 'valor_medido_desc' | 'valor_medido_asc' | 'saldo_desc' | 'saldo_asc'>('padrao')
  const [viewMode, setViewMode] = useState<'total' | 'material' | 'servico'>('total')

  // Acompanhamento data + INDEPENDENT cascade filter state per chart
  const [acomp, setAcomp] = useState<any>(null)
  // Chart 1 — Serviço
  const [s1, setS1] = useState(''); const [s2, setS2] = useState(''); const [s3, setS3] = useState('')
  // Chart 2 — Fat. Direto Aprovação
  const [f1, setF1] = useState(''); const [f2, setF2] = useState(''); const [f3, setF3] = useState('')
  // Chart 3 — Fat. Direto NFs
  const [n1, setN1] = useState(''); const [n2, setN2] = useState(''); const [n3, setN3] = useState('')

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

  useEffect(() => {
    fetch(`/api/contratos/${id}/acompanhamento`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAcomp(d) })
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
    const list = [...grupos]
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
  }, [grupos, sortBy, viewMode])

  // Gráfico sempre em ordem 1.0→19.0 e sem filtro de tipo (mostra tudo)
  const gruposOrdenados = useMemo(() =>
    [...grupos].sort((a, b) => parseFloat(a.codigo) - parseFloat(b.codigo)),
    [grupos]
  )

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <Topbar title="Carregando..." subtitle="" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="flex-1 overflow-auto">
        <Topbar title="Contrato não encontrado" subtitle="" />
        <div className="p-6">
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
  const gruposChart = gruposOrdenados.map(g => {
    const vContratado = getValorView(g)
    return {
      nome: g.nome.length > 18 ? g.nome.slice(0, 16) + '…' : g.nome,
      contratado: vContratado,
      medido: g.valor_medido,
      saldo: vContratado - g.valor_medido,
    }
  })

  return (
    <div className="flex-1 overflow-auto">
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
          <div className="flex gap-2 flex-wrap">
            <Link href="/contratos">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                Contratos
              </Button>
            </Link>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" strokeWidth={1.5} />
                Med. Serviços
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI: Valor Total */}
          <Link href={`/contratos/${id}/cronograma`}>
            <Card className="cursor-pointer group transition-all" style={{ borderColor: 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.5)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(59,130,246,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Valor Total</p>
                  <div className="w-9 h-9 rounded-xl kpi-icon-blue flex items-center justify-center transition-all" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                    <DollarSign className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
                  </div>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(valorTotal)}</p>
                <div className="flex gap-3 mt-2 text-xs" style={{ color: 'var(--text-3)' }}>
                  <span>Serv: {formatCurrency(contrato.valor_servicos ?? 0)}</span>
                  <span>Mat: {formatCurrency(contrato.valor_material_direto ?? 0)}</span>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* KPI: Medido */}
          <Link href={`/contratos/${id}/medicoes`}>
            <Card className="cursor-pointer group transition-all" style={{ borderColor: 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(16,185,129,0.10)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medido</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)' }}>
                    <TrendingUp className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                  </div>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--green)' }}>{formatCurrency(valorMedido)}</p>
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
          </Link>

          {/* KPI: Saldo */}
          <Link href={`/contratos/${id}/cronograma`}>
            <Card className="cursor-pointer group transition-all" style={{ borderColor: 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(100,116,139,0.5)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Saldo</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all" style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
                    <Wallet className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--text-2)' }} />
                  </div>
                </div>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(saldo)}</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-3)' }}>{formatPercent(100 - percentualMedido)} restante do contrato</p>
              </CardContent>
            </Card>
          </Link>

          {/* KPI: Medições */}
          <Link href={`/contratos/${id}/medicoes`}>
            <Card className="cursor-pointer group transition-all"
              style={{ borderColor: qtdPendentes > 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = qtdPendentes > 0 ? 'rgba(245,158,11,0.6)' : 'rgba(6,182,212,0.5)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = qtdPendentes > 0 ? 'rgba(245,158,11,0.4)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-3)' }}>Medições</p>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: qtdPendentes > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(6,182,212,0.10)', border: `1px solid ${qtdPendentes > 0 ? 'rgba(245,158,11,0.25)' : 'rgba(6,182,212,0.20)'}` }}>
                    <ClipboardList className="w-4 h-4" strokeWidth={1.5} style={{ color: qtdPendentes > 0 ? 'var(--amber)' : '#06B6D4' }} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>{qtdAprovadas}</p>
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

        {/* Tabs */}
        <Tabs defaultValue="visao-geral">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão Geral</TabsTrigger>
            <TabsTrigger value="medicoes">Medições</TabsTrigger>
            <TabsTrigger value="estrutura">Estrutura</TabsTrigger>
            <TabsTrigger value="aditivos">Aditivos {aditivos.length > 0 && `(${aditivos.length})`}</TabsTrigger>
            <TabsTrigger value="dados">Dados do Contrato</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Chart grupos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm text-[var(--text-2)]">Medido vs Contratado por Grupo (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={Math.max(320, gruposChart.length * 28)}>
                    <BarChart data={gruposChart} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#94A3B8' }} width={80} />
                      <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ backgroundColor: '#0D1421', border: '1px solid #1E293B', borderRadius: '8px', color: '#FFFFFF', fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }} />
                      <Bar dataKey="contratado" name="Contratado" fill="#64748B" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="medido" name="Medido" fill="#3B82F6" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grupos progress */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[var(--text-2)]">Avanço por Grupo Macro</CardTitle>
                  {/* Controles inline */}
                  <div className="flex flex-wrap gap-2 pt-2">
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
                    {(sortBy !== 'padrao' || viewMode !== 'total') && (
                      <button
                        onClick={() => { setSortBy('padrao'); setViewMode('total') }}
                        className="text-[11px] text-[var(--text-3)] hover:text-[var(--text-2)] px-2"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[360px] overflow-y-auto">
                  {gruposExibidos.map(g => {
                    const vBase = getValorView(g)
                    const pct = vBase > 0 ? (g.valor_medido / vBase) * 100 : 0
                    return (
                      <div key={g.id}>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-[var(--text-3)] flex-shrink-0">{g.codigo}</span>
                            <span className="text-xs font-medium text-[var(--text-2)] truncate">{g.nome}</span>
                          </div>
                          <span className="text-xs font-bold text-blue-400 flex-shrink-0 ml-2">{formatPercent(pct)}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
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

            {/* ── 3 Acompanhamento Charts — each with independent filters ── */}
            {acomp && (() => {
              const chartTooltipStyle = {
                background: '#0D1421', border: '1px solid #1E293B',
                borderRadius: 10, color: '#FFFFFF', fontSize: 12,
              }

              function buildRows(
                key_contratado: string, key_medido: string,
                cx1: string, cx2: string,
              ) {
                const toRow = (nome: string, nomeFull: string | undefined, contratado: number, medido: number) => ({
                  nome, nomeFull, contratado, medido,
                  pct: contratado > 0 ? Math.round((medido / contratado) * 100) : 0,
                })
                const selGrupo = acomp.grupos.find((g: any) => g.id === cx1) ?? null
                const tars = selGrupo?.tarefas ?? []
                const selTar = tars.find((t: any) => t.id === cx2) ?? null
                const dets = selTar?.detalhamentos ?? []
                if (!cx1) return [toRow('WAVE (Obra)', undefined, acomp.total[key_contratado], acomp.total[key_medido])]
                if (!cx2) return tars
                  .filter((t: any) => (t[key_contratado] ?? 0) > 0 || (t[key_medido] ?? 0) > 0)
                  .map((t: any) => toRow(t.codigo, t.nome, t[key_contratado] ?? 0, t[key_medido] ?? 0))
                return dets
                  .filter((d: any) => (d[key_contratado] ?? 0) > 0 || (d[key_medido] ?? 0) > 0)
                  .map((d: any) => toRow(d.local ?? d.codigo, d.nome, d[key_contratado] ?? 0, d[key_medido] ?? 0))
              }

              function ChartFilter({ cx1, cx2, cx3, setCx1, setCx2, setCx3 }: {
                cx1: string; cx2: string; cx3: string
                setCx1: (v: string) => void; setCx2: (v: string) => void; setCx3: (v: string) => void
              }) {
                const selGrupo = acomp.grupos.find((g: any) => g.id === cx1) ?? null
                const tars = selGrupo?.tarefas ?? []
                const selTar = tars.find((t: any) => t.id === cx2) ?? null
                const dets = selTar?.detalhamentos ?? []
                return (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <select value={cx1} onChange={e => { setCx1(e.target.value); setCx2(''); setCx3('') }}
                      className="rounded-xl px-3 py-1.5 text-xs outline-none"
                      style={{ background: 'var(--background)', border: `1px solid ${cx1 ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-1)' }}>
                      <option value="">Global (todos)</option>
                      {acomp.grupos.map((g: any) => <option key={g.id} value={g.id}>{g.codigo} — {g.nome.substring(0, 35)}</option>)}
                    </select>
                    <select value={cx2} onChange={e => { setCx2(e.target.value); setCx3('') }} disabled={!cx1}
                      className="rounded-xl px-3 py-1.5 text-xs outline-none disabled:opacity-40"
                      style={{ background: 'var(--background)', border: `1px solid ${cx2 ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-1)' }}>
                      <option value="">Todos (nível 2)</option>
                      {tars.map((t: any) => <option key={t.id} value={t.id}>{t.codigo} — {t.nome.substring(0, 30)}</option>)}
                    </select>
                    <select value={cx3} onChange={e => setCx3(e.target.value)} disabled={!cx2}
                      className="rounded-xl px-3 py-1.5 text-xs outline-none disabled:opacity-40"
                      style={{ background: 'var(--background)', border: `1px solid ${cx3 ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--text-1)' }}>
                      <option value="">Todos (nível 3)</option>
                      {dets.map((d: any) => <option key={d.id} value={d.id}>{d.local ?? d.codigo} — {(d.nome ?? '').substring(0, 25)}</option>)}
                    </select>
                    {(cx1 || cx2 || cx3) && (
                      <button onClick={() => { setCx1(''); setCx2(''); setCx3('') }}
                        className="px-3 py-1.5 text-xs rounded-xl transition-colors"
                        style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}>
                        Limpar
                      </button>
                    )}
                  </div>
                )
              }

              function AcompChart({ title, rows, cx1, cx2, colorC, colorM, labelC, labelM, accent, setCx1, setCx2, setCx3, cx3 }: any) {
                const h = !cx1 ? 100 : !cx2
                  ? Math.max(200, rows.length * 32)
                  : Math.max(200, rows.length * 32)
                // Summary stats
                const totalC = rows.reduce((s: number, r: any) => s + r.contratado, 0)
                const totalM = rows.reduce((s: number, r: any) => s + r.medido, 0)
                const totalPct = totalC > 0 ? Math.round((totalM / totalC) * 100) : 0
                return (
                  <Card style={{ borderTop: `2px solid ${accent}` }}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between mb-1">
                        <CardTitle className="text-sm" style={{ color: 'var(--text-2)' }}>{title}</CardTitle>
                        <div className="flex items-center gap-3 text-xs">
                          <span style={{ color: 'var(--text-3)' }}>{formatCurrency(totalM)}</span>
                          <span className="font-bold px-2 py-0.5 rounded-md" style={{
                            background: totalPct > 100 ? 'rgba(239,68,68,0.15)' : totalPct > 70 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.12)',
                            color: totalPct > 100 ? '#EF4444' : totalPct > 70 ? '#F59E0B' : accent,
                          }}>{totalPct}%</span>
                        </div>
                      </div>
                      <ChartFilter cx1={cx1} cx2={cx2} cx3={cx3} setCx1={setCx1} setCx2={setCx2} setCx3={setCx3} />
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={h}>
                        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} tickFormatter={v => `${(v / 1e6).toFixed(1)}M`} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: 'var(--text-2)' }} width={!cx1 ? 90 : 55} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={chartTooltipStyle}
                            formatter={(v: any, name: any, props: any) => {
                              const row = props?.payload
                              const pct = row?.pct ?? 0
                              return [
                                `${formatCurrency(v)}${name === labelM ? ` (${pct}%)` : ''}`,
                                name,
                              ]
                            }}
                            labelFormatter={(label: any, payload: any) => {
                              const row = payload?.[0]?.payload
                              return row?.nomeFull ? `${label} — ${row.nomeFull.substring(0, 45)}` : label
                            }} />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-2)', paddingTop: 8 }} />
                          <Bar dataKey="contratado" name={labelC} fill={colorC} radius={[0, 3, 3, 0]} maxBarSize={14} />
                          <Bar dataKey="medido" name={labelM} radius={[0, 3, 3, 0]} maxBarSize={14}>
                            {rows.map((row: any, i: number) => (
                              <Cell key={i} fill={
                                row.pct > 100 ? '#EF4444' :
                                row.pct > 80 ? '#F59E0B' :
                                colorM
                              } />
                            ))}
                            <LabelList dataKey="pct" position="right"
                              formatter={(v: any) => v > 0 ? `${v}%` : ''}
                              style={{ fill: 'var(--text-2)', fontSize: 10 }}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )
              }

              return (
                <div className="mt-6 space-y-4">
                  <AcompChart title="Acompanhamento Medição Serviço"
                    rows={buildRows('valor_servico', 'valor_medido_servico', s1, s2)}
                    cx1={s1} cx2={s2} cx3={s3} setCx1={setS1} setCx2={setS2} setCx3={setS3}
                    colorC="#64748B" colorM="#3B82F6" labelC="Contratado (Serviço)" labelM="Medido" accent="#3B82F6" />
                  <AcompChart title="Aprovação Pedidos Fat. Direto"
                    rows={buildRows('valor_material', 'valor_aprovado_fatd', f1, f2)}
                    cx1={f1} cx2={f2} cx3={f3} setCx1={setF1} setCx2={setF2} setCx3={setF3}
                    colorC="#6B7280" colorM="#10B981" labelC="Disponível (Material)" labelM="Aprovado" accent="#10B981" />
                  <AcompChart title="Faturamento Direto — NFs Recebidas"
                    rows={buildRows('valor_aprovado_fatd', 'valor_nf_fatd', n1, n2)}
                    cx1={n1} cx2={n2} cx3={n3} setCx1={setN1} setCx2={setN2} setCx3={setN3}
                    colorC="#6B7280" colorM="#06B6D4" labelC="Aprovado (Pedidos)" labelM="NFs Recebidas" accent="#06B6D4" />
                </div>
              )
            })()}
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

          {/* Estrutura */}
          <TabsContent value="estrutura">
            {/* Cabeçalho com filtros */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)]">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Ordenar:</span>
              </div>
              <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 text-xs w-52 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Padrão (1.0 → 19.0)</SelectItem>
                  <SelectItem value="valor_global_desc">Valor — Maior primeiro</SelectItem>
                  <SelectItem value="valor_global_asc">Valor — Menor primeiro</SelectItem>
                  <SelectItem value="valor_medido_desc">Medido — Maior primeiro</SelectItem>
                  <SelectItem value="valor_medido_asc">Medido — Menor primeiro</SelectItem>
                  <SelectItem value="saldo_desc">Saldo — Maior primeiro</SelectItem>
                  <SelectItem value="saldo_asc">Saldo — Menor primeiro</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1.5 text-xs text-[var(--text-3)] ml-2">
                <Filter className="w-3.5 h-3.5" />
                <span>Exibir:</span>
              </div>
              <Select value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-1)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total</SelectItem>
                  <SelectItem value="material">Material</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>

              {(sortBy !== 'padrao' || viewMode !== 'total') && (
                <Button
                  variant="ghost" size="sm"
                  className="h-8 text-xs text-[var(--text-3)] hover:text-[var(--text-1)]"
                  onClick={() => { setSortBy('padrao'); setViewMode('total') }}
                >
                  Limpar
                </Button>
              )}

              <span className="ml-auto text-xs text-[var(--text-3)]">
                {gruposExibidos.length} grupos
              </span>

              <Link href={`/contratos/${id}/estrutura`}>
                <Button variant="outline" size="sm" className="h-8">
                  <Layers className="w-4 h-4" />
                  Gerenciar Estrutura
                </Button>
              </Link>
            </div>

            <div className="space-y-2">
              {gruposExibidos.map(g => {
                const vBase = getValorView(g)
                return (
                <Card key={g.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-10 text-xs font-bold text-[var(--text-3)]">{g.codigo}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--text-1)]">{g.nome}</span>
                        </div>
                        <Progress
                          value={vBase > 0 ? (g.valor_medido / vBase) * 100 : 0}
                          className="h-1 mt-2 max-w-xs"
                        />
                      </div>
                      <div className="text-right text-xs min-w-[180px]">
                        <p className="font-semibold text-[var(--text-1)]">{VIEW_MODE_LABELS[viewMode]}: {formatCurrency(vBase)}</p>
                        <p className="text-[var(--text-3)]">Medido: {formatCurrency(g.valor_medido ?? 0)}</p>
                        <p className="text-emerald-500/80">Saldo: {formatCurrency(vBase - (g.valor_medido ?? 0))}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )
              })}
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
                    <p className="text-[var(--text-1)]">{contrato.contratante?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratante?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wide mb-0.5">Contratado</p>
                    <p className="text-[var(--text-1)]">{contrato.contratado?.nome}</p>
                    <p className="text-xs text-[var(--text-3)]">{contrato.contratado?.cnpj}</p>
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
    </div>
  )
}
