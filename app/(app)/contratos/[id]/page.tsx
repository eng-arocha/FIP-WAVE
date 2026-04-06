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
  ArrowLeft, Plus, FileText, Loader2,
  ChevronRight, Layers, ArrowUpDown, Filter, Package, TrendingUp
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

  // Acompanhamento data + cascade filter state
  const [acomp, setAcomp] = useState<any>(null)
  const [n1, setN1] = useState('') // grupo_id or ''
  const [n2, setN2] = useState('') // tarefa_id or ''
  const [n3, setN3] = useState('') // detalhamento_id or ''

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
        title={contrato.numero}
        subtitle={contrato.descricao}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link href="/contratos">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Contratos
              </Button>
            </Link>
            <Link href={`/contratos/${id}/cronograma`}>
              <Button variant="outline" size="sm" className="gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                <TrendingUp className="w-4 h-4" />
                Cronograma
              </Button>
            </Link>
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="outline" size="sm" className="gap-1.5 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                <Package className="w-4 h-4" />
                Fat. Direto
              </Button>
            </Link>
            <Link href={`/contratos/${id}/medicoes/nova`}>
              <Button size="sm">
                <Plus className="w-4 h-4" />
                Nova Medição
              </Button>
            </Link>
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-[#475569] uppercase tracking-wide font-medium">Valor Total</p>
              <p className="text-xl font-bold text-[#F1F5F9] mt-1">{formatCurrency(valorTotal)}</p>
              <div className="flex gap-3 mt-2 text-xs text-[#475569]">
                <span>Serv: {formatCurrency(contrato.valor_servicos ?? 0)}</span>
                <span>Mat: {formatCurrency(contrato.valor_material_direto ?? 0)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-[#475569] uppercase tracking-wide font-medium">Medido</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{formatCurrency(valorMedido)}</p>
              <p className="text-xs text-[#475569] mt-1">{formatPercent(percentualMedido)} do total</p>
              <Progress value={percentualMedido} className="h-1 mt-2" indicatorClassName="bg-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-[#475569] uppercase tracking-wide font-medium">Saldo</p>
              <p className="text-xl font-bold text-[#F1F5F9] mt-1">{formatCurrency(saldo)}</p>
              <p className="text-xs text-[#475569] mt-1">{formatPercent(100 - percentualMedido)} restante</p>
            </CardContent>
          </Card>
          <Card className={qtdPendentes > 0 ? 'border-amber-500/50' : ''}>
            <CardContent className="pt-5">
              <p className="text-xs text-[#475569] uppercase tracking-wide font-medium">Medições</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-xl font-bold text-[#F1F5F9]">{qtdAprovadas}</p>
                <p className="text-xs text-[#475569] mb-0.5">aprovadas</p>
              </div>
              {qtdPendentes > 0 && (
                <p className="text-xs text-amber-400 mt-1 font-medium">{qtdPendentes} aguardando aprovação</p>
              )}
            </CardContent>
          </Card>
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
                  <CardTitle className="text-sm text-[#94A3B8]">Medido vs Contratado por Grupo (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={gruposChart} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#475569' }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#94A3B8' }} width={80} />
                      <Tooltip formatter={(v) => formatCurrency(v as number)} contentStyle={{ backgroundColor: '#0D1421', border: '1px solid #1E293B', borderRadius: '8px', color: '#F1F5F9', fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
                      <Bar dataKey="contratado" name="Contratado" fill="#1E293B" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="medido" name="Medido" fill="#3B82F6" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grupos progress */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-[#94A3B8]">Avanço por Grupo Macro</CardTitle>
                  {/* Controles inline */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                      <SelectTrigger className="h-7 text-[11px] w-48 bg-[#0D1421] border-[#1E293B] text-[#F1F5F9]">
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
                      <SelectTrigger className="h-7 text-[11px] w-36 bg-[#0D1421] border-[#1E293B] text-[#F1F5F9]">
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
                        className="text-[11px] text-[#475569] hover:text-[#94A3B8] px-2"
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
                            <span className="text-xs font-bold text-[#475569] flex-shrink-0">{g.codigo}</span>
                            <span className="text-xs font-medium text-[#94A3B8] truncate">{g.nome}</span>
                          </div>
                          <span className="text-xs font-bold text-blue-400 flex-shrink-0 ml-2">{formatPercent(pct)}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex justify-between text-[10px] text-[#475569] mt-0.5">
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

            {/* ── 3 Acompanhamento Charts ─────────────────────────────── */}
            {acomp && (() => {
              // Cascade filter helpers
              const selectedGrupo = acomp.grupos.find((g: any) => g.id === n1) ?? null
              const tarefasN2 = selectedGrupo?.tarefas ?? []
              const selectedTarefa = tarefasN2.find((t: any) => t.id === n2) ?? null
              const detsN3 = selectedTarefa?.detalhamentos ?? []

              function buildChartRows(
                key_contratado: string,
                key_medido: string,
              ) {
                // Level 0 — global single bar when nothing selected
                if (!n1) {
                  return [{
                    nome: 'WAVE (Obra)',
                    contratado: acomp.total[key_contratado],
                    medido: acomp.total[key_medido],
                  }]
                }
                // Level 1 — tarefas of selected group
                if (!n2) {
                  return tarefasN2.map((t: any) => ({
                    nome: t.codigo,
                    nomeFull: t.nome,
                    contratado: t[key_contratado] ?? 0,
                    medido: t[key_medido] ?? 0,
                  }))
                }
                // Level 2 — detalhamentos of selected tarefa
                return detsN3.map((d: any) => ({
                  nome: d.local ?? d.codigo,
                  nomeFull: d.nome,
                  contratado: d[key_contratado] ?? 0,
                  medido: d[key_medido] ?? 0,
                }))
              }

              const chartTooltipStyle = {
                background: '#0D1421', border: '1px solid #1E293B',
                borderRadius: 10, color: '#F1F5F9', fontSize: 12,
              }

              const chartHeight = !n1 ? 100 : !n2 ? Math.max(180, tarefasN2.length * 28) : Math.max(180, detsN3.length * 28)

              const rowsServico = buildChartRows('valor_servico', 'valor_medido_servico')
              const rowsFatDAprov = buildChartRows('valor_material', 'valor_aprovado_fatd')
              const rowsFatDNF = buildChartRows('valor_aprovado_fatd', 'valor_nf_fatd')

              // Cascade filter UI
              const FilterBar = () => (
                <div className="flex flex-wrap gap-2 mb-4">
                  <select
                    value={n1}
                    onChange={e => { setN1(e.target.value); setN2(''); setN3('') }}
                    className="rounded-xl px-3 py-1.5 text-xs outline-none"
                    style={{ background: '#080C14', border: '1px solid #1E293B', color: n1 ? '#F1F5F9' : '#475569' }}
                  >
                    <option value="">Global (todos)</option>
                    {acomp.grupos.map((g: any) => (
                      <option key={g.id} value={g.id}>{g.codigo} — {g.nome.substring(0, 35)}</option>
                    ))}
                  </select>
                  <select
                    value={n2}
                    onChange={e => { setN2(e.target.value); setN3('') }}
                    disabled={!n1}
                    className="rounded-xl px-3 py-1.5 text-xs outline-none disabled:opacity-40"
                    style={{ background: '#080C14', border: '1px solid #1E293B', color: n2 ? '#F1F5F9' : '#475569' }}
                  >
                    <option value="">Todos (nível 2)</option>
                    {tarefasN2.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.codigo} — {t.nome.substring(0, 30)}</option>
                    ))}
                  </select>
                  <select
                    value={n3}
                    onChange={e => setN3(e.target.value)}
                    disabled={!n2}
                    className="rounded-xl px-3 py-1.5 text-xs outline-none disabled:opacity-40"
                    style={{ background: '#080C14', border: '1px solid #1E293B', color: n3 ? '#F1F5F9' : '#475569' }}
                  >
                    <option value="">Todos (nível 3)</option>
                    {detsN3.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.local ?? d.codigo} — {(d.nome ?? '').substring(0, 25)}</option>
                    ))}
                  </select>
                  {(n1 || n2 || n3) && (
                    <button
                      onClick={() => { setN1(''); setN2(''); setN3('') }}
                      className="px-3 py-1.5 text-xs rounded-xl transition-colors"
                      style={{ color: '#475569', border: '1px solid #1E293B' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94A3B8' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#475569' }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              )

              function AcompChart({
                title, rows, keyContratado, keyMedido, colorContratado, colorMedido,
                labelContratado, labelMedido, accentColor,
              }: {
                title: string; rows: any[]; keyContratado: string; keyMedido: string
                colorContratado: string; colorMedido: string
                labelContratado: string; labelMedido: string; accentColor: string
              }) {
                return (
                  <Card style={{ borderTop: `2px solid ${accentColor}` }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm" style={{ color: '#94A3B8' }}>{title}</CardTitle>
                      <FilterBar />
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        <BarChart
                          data={rows}
                          layout="vertical"
                          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10, fill: '#475569' }}
                            tickFormatter={v => `${(v / 1e6).toFixed(1)}M`}
                            axisLine={false} tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="nome"
                            tick={{ fontSize: 10, fill: '#94A3B8' }}
                            width={!n1 ? 80 : 55}
                            axisLine={false} tickLine={false}
                          />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            formatter={(v: any, name: string, props: any) => [
                              formatCurrency(v),
                              name,
                            ]}
                            labelFormatter={(label: string, payload: any[]) => {
                              const row = payload?.[0]?.payload
                              return row?.nomeFull ? `${label} — ${row.nomeFull.substring(0, 45)}` : label
                            }}
                          />
                          <Legend
                            iconSize={8}
                            wrapperStyle={{ fontSize: 11, color: '#94A3B8', paddingTop: 8 }}
                          />
                          <Bar
                            dataKey="contratado"
                            name={labelContratado}
                            fill={colorContratado}
                            radius={[0, 3, 3, 0]}
                            maxBarSize={14}
                          />
                          <Bar
                            dataKey="medido"
                            name={labelMedido}
                            fill={colorMedido}
                            radius={[0, 3, 3, 0]}
                            maxBarSize={14}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )
              }

              return (
                <div className="mt-6 space-y-4">
                  {/* Chart 1 — Service measurement */}
                  <AcompChart
                    title="Acompanhamento Medição Serviço"
                    rows={rowsServico}
                    keyContratado="valor_servico"
                    keyMedido="valor_medido_servico"
                    colorContratado="#1E3A5F"
                    colorMedido="#3B82F6"
                    labelContratado="Contratado (Serviço)"
                    labelMedido="Medido"
                    accentColor="#3B82F6"
                  />
                  {/* Chart 2 — Fat direto approvals */}
                  <AcompChart
                    title="Aprovação Pedidos Fat. Direto"
                    rows={rowsFatDAprov}
                    keyContratado="valor_material"
                    keyMedido="valor_aprovado_fatd"
                    colorContratado="#064E3B"
                    colorMedido="#10B981"
                    labelContratado="Disponível (Material)"
                    labelMedido="Aprovado"
                    accentColor="#10B981"
                  />
                  {/* Chart 3 — Fat direto NFs */}
                  <AcompChart
                    title="Faturamento Direto — NFs Recebidas"
                    rows={rowsFatDNF}
                    keyContratado="valor_aprovado_fatd"
                    keyMedido="valor_nf_fatd"
                    colorContratado="#0C4A6E"
                    colorMedido="#06B6D4"
                    labelContratado="Aprovado (Pedidos)"
                    labelMedido="NFs Recebidas"
                    accentColor="#06B6D4"
                  />
                </div>
              )
            })()}
          </TabsContent>

          {/* Medições */}
          <TabsContent value="medicoes">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-[#94A3B8]">{medicoes.length} medição(ões) registrada(s)</p>
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
                            <span className="font-semibold text-sm text-[#F1F5F9]">Medição {m.periodo_referencia}</span>
                            <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                            </Badge>
                            <Badge className={TIPO_MEDICAO_COLORS[m.tipo]}>
                              {TIPO_MEDICAO_LABELS[m.tipo]}
                            </Badge>
                          </div>
                          <p className="text-xs text-[#475569]">Solicitante: {m.solicitante_nome}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-[#F1F5F9]">{formatCurrency(m.valor_total)}</p>
                          <p className="text-xs text-[#475569] mt-0.5">
                            {m.status === 'aprovado' && m.data_aprovacao
                              ? `Aprovado em ${formatDate(m.data_aprovacao)}`
                              : m.data_submissao
                              ? `Submetido em ${formatDate(m.data_submissao)}`
                              : ''
                            }
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#475569] flex-shrink-0" />
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
              <div className="flex items-center gap-1.5 text-xs text-[#475569]">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span>Ordenar:</span>
              </div>
              <Select value={sortBy} onValueChange={v => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 text-xs w-52 bg-[#0D1421] border-[#1E293B] text-[#F1F5F9]">
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

              <div className="flex items-center gap-1.5 text-xs text-[#475569] ml-2">
                <Filter className="w-3.5 h-3.5" />
                <span>Exibir:</span>
              </div>
              <Select value={viewMode} onValueChange={v => setViewMode(v as typeof viewMode)}>
                <SelectTrigger className="h-8 text-xs w-36 bg-[#0D1421] border-[#1E293B] text-[#F1F5F9]">
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
                  className="h-8 text-xs text-[#475569] hover:text-[#F1F5F9]"
                  onClick={() => { setSortBy('padrao'); setViewMode('total') }}
                >
                  Limpar
                </Button>
              )}

              <span className="ml-auto text-xs text-[#475569]">
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
                      <span className="w-10 text-xs font-bold text-[#475569]">{g.codigo}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#F1F5F9]">{g.nome}</span>
                        </div>
                        <Progress
                          value={vBase > 0 ? (g.valor_medido / vBase) * 100 : 0}
                          className="h-1 mt-2 max-w-xs"
                        />
                      </div>
                      <div className="text-right text-xs min-w-[180px]">
                        <p className="font-semibold text-[#F1F5F9]">{VIEW_MODE_LABELS[viewMode]}: {formatCurrency(vBase)}</p>
                        <p className="text-[#475569]">Medido: {formatCurrency(g.valor_medido ?? 0)}</p>
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
              <div className="text-center py-12 text-[#475569]">
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
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Número</p>
                    <p className="text-[#F1F5F9] font-medium">{contrato.numero}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Tipo</p>
                    <p className="text-[#F1F5F9]">{CONTRATO_TIPO_LABELS[contrato.tipo as ContratoTipo]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Contratante</p>
                    <p className="text-[#F1F5F9]">{contrato.contratante?.nome}</p>
                    <p className="text-xs text-[#475569]">{contrato.contratante?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Contratado</p>
                    <p className="text-[#F1F5F9]">{contrato.contratado?.nome}</p>
                    <p className="text-xs text-[#475569]">{contrato.contratado?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-[#F1F5F9]">{formatDate(contrato.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Término</p>
                    <p className="text-[#F1F5F9]">{formatDate(contrato.data_fim)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Local da Obra</p>
                    <p className="text-[#F1F5F9]">{contrato.local_obra}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Fiscal de Obra</p>
                    <p className="text-[#F1F5F9]">{contrato.fiscal_obra}</p>
                    <p className="text-xs text-[#475569]">{contrato.email_fiscal}</p>
                  </div>
                  <div className="col-span-2 border-t border-[#1E293B] pt-3">
                    <p className="text-xs text-[#475569] font-medium uppercase tracking-wide mb-0.5">Objeto</p>
                    <p className="text-[#94A3B8]">{contrato.objeto}</p>
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
