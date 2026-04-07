'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import {
  TrendingUp, FileText, Clock, CheckCircle2, AlertCircle,
  DollarSign, Plus, ArrowRight, Loader2, Maximize2, X
} from 'lucide-react'
import { formatCurrency, formatPercent, getContratoStatusColor, getMedicaoStatusColor } from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, MEDICAO_STATUS_LABELS, type MedicaoStatus } from '@/types'

// Dados extraídos do Excel: Cronograma Físico Financeiro WAVE - FIP rev 07
// Linha ACUMULADO (%) — mar/26 a out/27
const CURVA_S_DATA = [
  { mes: 'Mar/26', previsto: 0.3008,  acumulado_prev: 0.30,   acumulado_real: null },
  { mes: 'Abr/26', previsto: 0.1284,  acumulado_prev: 0.43,   acumulado_real: null },
  { mes: 'Mai/26', previsto: 3.8435,  acumulado_prev: 4.27,   acumulado_real: null },
  { mes: 'Jun/26', previsto: 5.2701,  acumulado_prev: 9.54,   acumulado_real: null },
  { mes: 'Jul/26', previsto: 7.1240,  acumulado_prev: 16.67,  acumulado_real: null },
  { mes: 'Ago/26', previsto: 19.5946, acumulado_prev: 36.26,  acumulado_real: null },
  { mes: 'Set/26', previsto: 10.6101, acumulado_prev: 46.87,  acumulado_real: null },
  { mes: 'Out/26', previsto: 6.3746,  acumulado_prev: 53.25,  acumulado_real: null },
  { mes: 'Nov/26', previsto: 6.0131,  acumulado_prev: 59.26,  acumulado_real: null },
  { mes: 'Dez/26', previsto: 5.1064,  acumulado_prev: 64.37,  acumulado_real: null },
  { mes: 'Jan/27', previsto: 4.5891,  acumulado_prev: 68.95,  acumulado_real: null },
  { mes: 'Fev/27', previsto: 3.9572,  acumulado_prev: 72.91,  acumulado_real: null },
  { mes: 'Mar/27', previsto: 3.9805,  acumulado_prev: 76.89,  acumulado_real: null },
  { mes: 'Abr/27', previsto: 3.6255,  acumulado_prev: 80.52,  acumulado_real: null },
  { mes: 'Mai/27', previsto: 4.8520,  acumulado_prev: 85.37,  acumulado_real: null },
  { mes: 'Jun/27', previsto: 5.6966,  acumulado_prev: 91.07,  acumulado_real: null },
  { mes: 'Jul/27', previsto: 4.5873,  acumulado_prev: 95.65,  acumulado_real: null },
  { mes: 'Ago/27', previsto: 3.5201,  acumulado_prev: 99.17,  acumulado_real: null },
  { mes: 'Set/27', previsto: 0.8166,  acumulado_prev: 99.99,  acumulado_real: null },
  { mes: 'Out/27', previsto: 0.0077,  acumulado_prev: 100.00, acumulado_real: null },
]

// Converte "2026-03" → "Mar/26" para cruzar com CURVA_S_DATA
function periodoToMesLabel(periodo: string): string {
  const [year, month] = periodo.split('-')
  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${meses[parseInt(month, 10) - 1]}/${year.slice(2)}`
}

const chartTooltipStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: '8px',
  color: '#1D1D1F',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
}

function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) { setVal(target); clearInterval(timer) }
      else setVal(start)
    }, 16)
    return () => clearInterval(timer)
  }, [target, duration])
  return val
}

export default function DashboardPage() {
  const [contratos, setContratos] = useState<any[]>([])
  const [medicoesRecentes, setMedicoesRecentes] = useState<any[]>([])
  const [grupos, setGrupos] = useState<any[]>([])
  const [hierarquia, setHierarquia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [rtConnected, setRtConnected] = useState(false)
  const [maximized, setMaximized] = useState<string | null>(null) // 'curvaS' | 'acomp' | 'contratos' | 'medicoes'

  // ESC closes maximized
  useEffect(() => {
    if (!maximized) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMaximized(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maximized])

  // Filtros cascata do gráfico de acompanhamento
  const [filtroN1, setFiltroN1] = useState<string>('')
  const [filtroN2, setFiltroN2] = useState<string>('')
  const [filtroN3, setFiltroN3] = useState<string>('')

  async function fetchDashboard(initial = false) {
    try {
      const [dashRes, hierRes] = await Promise.all([
        fetch('/api/dashboard'),
        fetch('/api/dashboard/hierarquia'),
      ])
      if (dashRes.ok) {
        const data = await dashRes.json()
        setContratos(data.contratos || [])
        setMedicoesRecentes(data.medicoes_recentes || [])
        setGrupos(data.grupos || [])
      }
      if (hierRes.ok) {
        const data = await hierRes.json()
        setHierarquia(data.hierarquia || [])
      }
    } finally {
      if (initial) setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboard(true)
  }, [])

  // Realtime subscription — refresh KPIs when any measurement changes
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medicoes' },
        () => { fetchDashboard() }
      )
      .subscribe((status) => setRtConnected(status === 'SUBSCRIBED'))

    return () => { supabase.removeChannel(channel) }
  }, [])

  const totalContratado = contratos.reduce((a, c) => a + (c.valor_contratado || 0), 0)
  const totalMedido = contratos.reduce((a, c) => a + (c.valor_medido || 0), 0)
  const totalSaldo = contratos.reduce((a, c) => a + (c.saldo || 0), 0)
  const pendentesAprovacao = contratos.reduce((a, c) => a + (c.qtd_medicoes_pendentes || 0), 0)

  const animatedTotalMedido = useCountUp(totalMedido)
  const animatedTotalContratos = useCountUp(contratos.length)
  const animatedPendentes = useCountUp(pendentesAprovacao)

  const alertas = useMemo(() => {
    const list: { type: 'warning' | 'danger' | 'info'; msg: string }[] = []
    const pendentes = medicoesRecentes.filter((m: any) => m.status === 'submetido' || m.status === 'em_analise')
    if (pendentes.length > 0)
      list.push({ type: 'warning', msg: `${pendentes.length} medição(ões) aguardando aprovação` })
    const hoje = new Date()
    contratos.forEach((c: any) => {
      if (!c.data_fim) return
      const fim = new Date(c.data_fim)
      const diasRestantes = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
      if (diasRestantes > 0 && diasRestantes <= 30 && c.status === 'ativo')
        list.push({ type: 'danger', msg: `${c.numero}: vence em ${diasRestantes} dia(s)` })
    })
    const baixoAvanco = contratos.filter((c: any) => c.status === 'ativo' && (c.percentual_medido || 0) < 10)
    if (baixoAvanco.length > 0)
      list.push({ type: 'info', msg: `${baixoAvanco.length} contrato(s) com avanço abaixo de 10%` })
    return list
  }, [contratos, medicoesRecentes])

  // Curva S: sobrepõe medições aprovadas ao cronograma base do Excel
  const curvaSData = useMemo(() => {
    // Acumula por período (converte YYYY-MM → Mes/AA para cruzar com CURVA_S_DATA)
    const realByPeriod: Record<string, number> = {}
    medicoesRecentes.forEach((m: any) => {
      if (m.status !== 'aprovado' || !m.periodo_referencia || !m.valor_total) return
      const label = periodoToMesLabel(m.periodo_referencia)
      realByPeriod[label] = (realByPeriod[label] || 0) + (m.valor_total as number)
    })
    const hasRealData = Object.keys(realByPeriod).length > 0
    if (!hasRealData) return CURVA_S_DATA

    let acumuladoReal = 0
    return CURVA_S_DATA.map((row) => {
      if (realByPeriod[row.mes] !== undefined) {
        const realPct = totalContratado > 0
          ? (realByPeriod[row.mes] / totalContratado) * 100
          : 0
        acumuladoReal += realPct
        return { ...row, acumulado_real: acumuladoReal }
      }
      return acumuladoReal > 0
        ? { ...row, acumulado_real: acumuladoReal }
        : row
    })
  }, [medicoesRecentes, totalContratado])

  // Opções dos filtros cascata (dependentes entre si)
  const opcoesN1 = hierarquia
  const grupoSelecionado = opcoesN1.find((g: any) => g.id === filtroN1)
  const opcoesN2: any[] = grupoSelecionado?.tarefas ?? []
  const tarefaSelecionada = opcoesN2.find((t: any) => t.id === filtroN2)
  const opcoesN3: any[] = tarefaSelecionada?.detalhamentos ?? []

  // Dados do gráfico conforme filtro ativo
  const chartAcompData = useMemo(() => {
    if (filtroN2 && tarefaSelecionada) {
      // Nível 3: detalhamentos da tarefa selecionada
      return (tarefaSelecionada.detalhamentos || []).map((d: any) => ({
        nome: `${d.codigo} ${d.descricao}`.substring(0, 40),
        contratado: d.valor_total,
        medido: d.valor_medido,
      }))
    }
    if (filtroN1 && grupoSelecionado) {
      // Nível 2: tarefas do grupo selecionado
      return (grupoSelecionado.tarefas || []).map((t: any) => ({
        nome: `${t.codigo} ${t.nome}`.substring(0, 40),
        contratado: t.valor_total,
        medido: t.valor_medido,
      }))
    }
    // Nível 1 (Global): todos os grupos
    return hierarquia.map((g: any) => ({
      nome: g.nome.substring(0, 40),
      contratado: g.valor_contratado,
      medido: g.valor_medido,
    }))
  }, [hierarquia, filtroN1, filtroN2, grupoSelecionado, tarefaSelecionada])

  function MaxBtn({ id }: { id: string }) {
    return (
      <button
        onClick={() => setMaximized(id)}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
        style={{ color: '#86868B' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#1D1D1F' }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#86868B' }}
        title="Maximizar"
      >
        <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3B82F6' }} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
      <Topbar
        title="Dashboard Geral"
        subtitle={
          <span className="flex items-center gap-2">
            Visão consolidada de todos os contratos
            <span className="flex items-center gap-1" style={{ color: rtConnected ? '#10B981' : '#475569' }}>
              <span
                className={`w-1.5 h-1.5 rounded-full inline-block ${rtConnected ? 'animate-pulse' : ''}`}
                style={{ background: rtConnected ? '#10B981' : '#475569' }}
              />
              {rtConnected ? 'Ao Vivo' : 'Conectando...'}
            </span>
          </span>
        }
        actions={
          <Link href="/contratos/novo">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              Novo Contrato
            </Button>
          </Link>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Contratado */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderBottom: '2px solid rgba(59,130,246,0.40)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Total Contratado
                </p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
                  {formatCurrency(totalContratado)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  {Math.round(animatedTotalContratos)} contrato(s) ativo(s)
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)' }}
              >
                <FileText className="w-5 h-5" style={{ color: '#3B82F6' }} />
              </div>
            </div>
          </div>

          {/* Total Medido */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderBottom: '2px solid rgba(16,185,129,0.40)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Total Medido
                </p>
                <p className="text-2xl font-bold" style={{ color: 'var(--green)' }}>
                  {formatCurrency(animatedTotalMedido)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  {totalContratado > 0 ? formatPercent(totalMedido / totalContratado * 100) : '0%'} do total
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.15)' }}
              >
                <TrendingUp className="w-5 h-5" style={{ color: 'var(--green)' }} />
              </div>
            </div>
          </div>

          {/* Saldo Restante */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderBottom: '2px solid rgba(71,85,105,0.60)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-hover)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Saldo Restante
                </p>
                <p className="text-2xl font-bold" style={{ color: 'var(--text-1)' }}>
                  {formatCurrency(totalSaldo)}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-3)' }}>
                  {totalContratado > 0 ? formatPercent(totalSaldo / totalContratado * 100) : '0%'} do total
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(71,85,105,0.20)' }}
              >
                <DollarSign className="w-5 h-5" style={{ color: 'var(--text-2)' }} />
              </div>
            </div>
          </div>

          {/* Aguardando Aprovação */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: 'var(--surface-2)',
              border: `1px solid ${pendentesAprovacao > 0 ? 'rgba(245,158,11,0.30)' : '#1E293B'}`,
              borderBottom: `2px solid ${pendentesAprovacao > 0 ? 'rgba(245,158,11,0.50)' : 'rgba(71,85,105,0.40)'}`,
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-3)' }}>
                  Aguard. Aprovação
                </p>
                <p
                  className="text-2xl font-bold mt-1"
                  style={{ color: pendentesAprovacao > 0 ? 'var(--amber)' : 'var(--text-1)' }}
                >
                  {Math.round(animatedPendentes)}
                </p>
                <Link
                  href="/aprovacoes"
                  className="text-xs mt-1 inline-block hover:underline"
                  style={{ color: '#3B82F6' }}
                >
                  Ver fila →
                </Link>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: pendentesAprovacao > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(71,85,105,0.20)',
                }}
              >
                {pendentesAprovacao > 0 ? (
                  <AlertCircle className="w-5 h-5" style={{ color: 'var(--amber)' }} />
                ) : (
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--text-3)' }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Smart Alerts */}
        {alertas.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {alertas.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border" style={{
                background: a.type === 'danger' ? 'rgba(239,68,68,0.12)' : a.type === 'warning' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.10)',
                borderColor: a.type === 'danger' ? 'rgba(239,68,68,0.35)' : a.type === 'warning' ? 'rgba(245,158,11,0.35)' : 'rgba(59,130,246,0.25)',
                color: a.type === 'danger' ? 'var(--red)' : a.type === 'warning' ? 'var(--amber)' : 'var(--accent)',
              }}>
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                  background: a.type === 'danger' ? 'var(--red)' : a.type === 'warning' ? 'var(--amber)' : 'var(--accent)',
                }} />
                {a.msg}
              </div>
            ))}
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Curva S */}
          <div
            className="rounded-xl overflow-hidden group"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                Curva S — Avanço Físico-Financeiro Acumulado (%)
              </h3>
              <MaxBtn id="curvaS" />
            </div>
            <div className="px-4 pb-5" style={{ background: 'var(--surface-1)', margin: '0 12px 12px', borderRadius: '10px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={curvaSData} margin={{ top: 12, right: 10, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="gradPrev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2d3f5c" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#2d3f5c" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                    interval={2}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                    unit="%"
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v) => v !== null ? `${v}%` : 'N/D'}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="acumulado_prev"
                    name="Previsto"
                    stroke="#2d3f5c"
                    fill="url(#gradPrev)"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="acumulado_real"
                    name="Realizado"
                    stroke="#3B82F6"
                    fill="url(#gradReal)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Acompanhamento Medição Serviço */}
          <div
            className="rounded-xl overflow-hidden group"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            {/* Cabeçalho + filtros */}
            <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>
                  Acompanhamento Medição Serviço
                </h3>
                <div className="flex items-center gap-1">
                  <MaxBtn id="acomp" />
                  {(filtroN1 || filtroN2 || filtroN3) && (
                    <button
                      onClick={() => { setFiltroN1(''); setFiltroN2(''); setFiltroN3('') }}
                      className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                      style={{ color: 'var(--text-2)', border: '1px solid var(--border)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.borderColor = '#3B82F6' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
              {/* 3 selects cascata */}
              <div className="grid grid-cols-3 gap-2">
                {/* Filtro 1 — Nível 1 (Grupos) */}
                <select
                  value={filtroN1}
                  onChange={e => { setFiltroN1(e.target.value); setFiltroN2(''); setFiltroN3('') }}
                  className="text-xs rounded-lg px-2.5 py-1.5 w-full"
                  style={{
                    background: 'var(--surface-1)',
                    border: `1px solid ${filtroN1 ? '#3B82F6' : 'var(--border)'}`,
                    color: filtroN1 ? 'var(--text-1)' : 'var(--text-3)',
                    outline: 'none',
                  }}
                >
                  <option value="">Global (todos)</option>
                  {opcoesN1.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.codigo} — {g.nome}</option>
                  ))}
                </select>

                {/* Filtro 2 — Nível 2 (Tarefas) */}
                <select
                  value={filtroN2}
                  onChange={e => { setFiltroN2(e.target.value); setFiltroN3('') }}
                  disabled={!filtroN1}
                  className="text-xs rounded-lg px-2.5 py-1.5 w-full"
                  style={{
                    background: 'var(--surface-1)',
                    border: `1px solid ${filtroN2 ? '#3B82F6' : 'var(--border)'}`,
                    color: !filtroN1 ? 'var(--text-3)' : filtroN2 ? 'var(--text-1)' : 'var(--text-3)',
                    outline: 'none',
                    cursor: !filtroN1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="">Todos (nível 2)</option>
                  {opcoesN2.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.codigo} — {t.nome}</option>
                  ))}
                </select>

                {/* Filtro 3 — Nível 3 (Detalhamentos) */}
                <select
                  value={filtroN3}
                  onChange={e => setFiltroN3(e.target.value)}
                  disabled={!filtroN2}
                  className="text-xs rounded-lg px-2.5 py-1.5 w-full"
                  style={{
                    background: 'var(--surface-1)',
                    border: `1px solid ${filtroN3 ? '#3B82F6' : 'var(--border)'}`,
                    color: !filtroN2 ? 'var(--text-3)' : filtroN3 ? 'var(--text-1)' : 'var(--text-3)',
                    outline: 'none',
                    cursor: !filtroN2 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <option value="">Todos (nível 3)</option>
                  {opcoesN3.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.codigo} — {d.descricao}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Gráfico */}
            <div className="px-4 pb-5 pt-3" style={{ background: 'var(--surface-1)', margin: '0 12px 12px', borderRadius: '10px' }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartAcompData} layout="vertical" margin={{ top: 8, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fontSize: 9, fill: 'var(--text-3)' }}
                    width={110}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v) => formatCurrency(v as number)}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, color: 'var(--text-2)' }}
                  />
                  <Bar dataKey="contratado" name="Contratado" fill="#64748B" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="medido" name="Medido" fill="#3B82F6" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Contratos + Medições recentes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Contratos */}
          <div
            className="rounded-xl overflow-hidden group"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Contratos Ativos</h3>
              <div className="flex items-center gap-1">
                <MaxBtn id="contratos" />
              <Link href="/contratos">
                <button
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'transparent' }}
                >
                  Ver todos <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {contratos.map((c: any) => (
                <Link key={c.contrato_id} href={`/contratos/${c.contrato_id}`}>
                  <div
                    className="p-3 rounded-xl transition-all duration-150 cursor-pointer"
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(59,130,246,0.50)'
                      e.currentTarget.style.background = 'var(--surface-3)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface-1)'
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>{c.numero}</p>
                        <p className="text-xs line-clamp-1 mt-0.5" style={{ color: 'var(--text-3)' }}>{c.descricao}</p>
                      </div>
                      <Badge className={getContratoStatusColor(c.status)}>
                        {CONTRATO_STATUS_LABELS[c.status as keyof typeof CONTRATO_STATUS_LABELS]}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs" style={{ color: 'var(--text-3)' }}>
                        <span>Avanço financeiro</span>
                        <span className="font-semibold" style={{ color: 'var(--text-2)' }}>
                          {formatPercent(c.percentual_medido || 0)}
                        </span>
                      </div>
                      {/* Custom progress bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(c.percentual_medido || 0, 100)}%`,
                            background: 'linear-gradient(90deg, #2563EB, #06B6D4)',
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span style={{ color: 'var(--text-3)' }}>
                          Medido:{' '}
                          <span className="font-medium" style={{ color: 'var(--text-2)' }}>
                            {formatCurrency(c.valor_medido || 0)}
                          </span>
                        </span>
                        <span style={{ color: 'var(--text-3)' }}>
                          Saldo:{' '}
                          <span className="font-medium" style={{ color: 'var(--text-2)' }}>
                            {formatCurrency(c.saldo || 0)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Medições Recentes */}
          <div
            className="rounded-xl overflow-hidden group"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-1)' }}>Medições Recentes</h3>
              <div className="flex items-center gap-1">
                <MaxBtn id="medicoes" />
              <Link href="/aprovacoes">
                <button
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'transparent' }}
                >
                  Fila de aprovação <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
              </div>
            </div>
            <div className="p-4">
              <div className="space-y-1">
                {medicoesRecentes.map((m: any) => (
                  <Link key={m.id} href={`/contratos/${m.contrato?.id}/medicoes/${m.id}`}>
                    <div
                      className="flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 cursor-pointer"
                      style={{ border: '1px solid transparent' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--surface-3)'
                        e.currentTarget.style.borderColor = 'var(--border)'
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.borderColor = 'transparent'
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: 'rgba(59,130,246,0.12)' }}
                      >
                        <span
                          className="text-xs font-bold"
                          style={{
                            background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                          }}
                        >
                          #{String(m.numero).padStart(2, '0')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>
                            Medição {m.periodo_referencia}
                          </span>
                          <Badge className={`${getMedicaoStatusColor(m.status as MedicaoStatus)} text-[10px]`}>
                            {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                          </Badge>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--text-3)' }}>{m.contrato?.numero}</p>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--text-1)' }}>
                        {formatCurrency(m.valor_total)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen overlay */}
      {maximized && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#F5F5F7' }}>
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-3" style={{ background: 'white', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#1D1D1F' }}>
              {maximized === 'curvaS' && 'Curva S — Avanço Físico-Financeiro Acumulado (%)'}
              {maximized === 'acomp' && 'Acompanhamento Medição Serviço'}
              {maximized === 'contratos' && 'Contratos Ativos'}
              {maximized === 'medicoes' && 'Medições Recentes'}
            </h2>
            <button
              onClick={() => setMaximized(null)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{ color: '#86868B' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#1D1D1F' }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = '#86868B' }}
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-6">
            {maximized === 'curvaS' && (
              <div className="rounded-xl p-6" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
                <ResponsiveContainer width="100%" height={window.innerHeight - 150}>
                  <AreaChart data={curvaSData} margin={{ top: 12, right: 30, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="gradPrevMax" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2d3f5c" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#2d3f5c" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="gradRealMax" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0071E3" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0071E3" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#86868B' }} axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#86868B' }} unit="%" axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 12 }} formatter={(v) => v !== null ? `${v}%` : 'N/D'} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="acumulado_prev" name="Previsto" stroke="#2d3f5c" fill="url(#gradPrevMax)" strokeDasharray="5 3" strokeWidth={2} />
                    <Area type="monotone" dataKey="acumulado_real" name="Realizado" stroke="#0071E3" fill="url(#gradRealMax)" strokeWidth={2} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {maximized === 'acomp' && (
              <div className="rounded-xl p-6" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
                <ResponsiveContainer width="100%" height={window.innerHeight - 150}>
                  <BarChart data={chartAcompData} layout="vertical" margin={{ top: 8, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#86868B' }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11, fill: '#424245' }} width={160} axisLine={{ stroke: 'rgba(0,0,0,0.06)' }} tickLine={false} />
                    <Tooltip contentStyle={{ background: 'white', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, fontSize: 12 }} formatter={(v) => formatCurrency(v as number)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="contratado" name="Contratado" fill="#86868B" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="medido" name="Medido" fill="#0071E3" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {maximized === 'contratos' && (
              <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="p-4 space-y-3">
                  {contratos.map((c: any) => (
                    <Link key={c.contrato_id} href={`/contratos/${c.contrato_id}`}>
                      <div className="p-4 rounded-xl transition-all cursor-pointer" style={{ background: '#F5F5F7', border: '1px solid rgba(0,0,0,0.06)' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,113,227,0.3)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)' }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="font-semibold text-sm" style={{ color: '#1D1D1F' }}>{c.numero}</p>
                            <p className="text-xs mt-0.5" style={{ color: '#86868B' }}>{c.descricao}</p>
                          </div>
                          <Badge className={getContratoStatusColor(c.status)}>{CONTRATO_STATUS_LABELS[c.status as keyof typeof CONTRATO_STATUS_LABELS]}</Badge>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.06)' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(c.percentual_medido || 0, 100)}%`, background: 'linear-gradient(90deg, #0071E3, #42A5F5)' }} />
                        </div>
                        <div className="flex justify-between text-xs mt-2">
                          <span style={{ color: '#86868B' }}>Medido: <strong style={{ color: '#424245' }}>{formatCurrency(c.valor_medido || 0)}</strong></span>
                          <span style={{ color: '#86868B' }}>Saldo: <strong style={{ color: '#424245' }}>{formatCurrency(c.saldo || 0)}</strong></span>
                          <span style={{ color: '#0071E3' }}>{formatPercent(c.percentual_medido || 0)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {maximized === 'medicoes' && (
              <div className="rounded-xl overflow-hidden" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div className="p-4 space-y-1">
                  {medicoesRecentes.map((m: any) => (
                    <Link key={m.id} href={`/contratos/${m.contrato?.id}/medicoes/${m.id}`}>
                      <div className="flex items-center gap-4 p-3 rounded-xl transition-all cursor-pointer" style={{ border: '1px solid transparent' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F7'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.borderColor = 'transparent' }}
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,113,227,0.08)' }}>
                          <span className="text-xs font-bold" style={{ color: '#0071E3' }}>#{String(m.numero).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium" style={{ color: '#1D1D1F' }}>Medição {m.periodo_referencia}</span>
                            <Badge className={`${getMedicaoStatusColor(m.status as MedicaoStatus)} text-[10px]`}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                            </Badge>
                          </div>
                          <p className="text-xs" style={{ color: '#86868B' }}>{m.contrato?.numero} · {m.solicitante_nome}</p>
                        </div>
                        <span className="text-sm font-semibold" style={{ color: '#1D1D1F' }}>{formatCurrency(m.valor_total)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
