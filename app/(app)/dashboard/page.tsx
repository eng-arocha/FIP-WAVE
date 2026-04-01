'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import {
  TrendingUp, FileText, Clock, CheckCircle2, AlertCircle,
  DollarSign, Plus, ArrowRight, Loader2
} from 'lucide-react'
import { formatCurrency, formatPercent, getContratoStatusColor, getMedicaoStatusColor } from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, MEDICAO_STATUS_LABELS, type MedicaoStatus } from '@/types'

const CURVA_S_DATA = [
  { mes: 'Jan/25', previsto: 5, realizado: 0, acumulado_prev: 5, acumulado_real: 0 },
  { mes: 'Fev/25', previsto: 8, realizado: 0, acumulado_prev: 13, acumulado_real: 0 },
  { mes: 'Mar/25', previsto: 10, realizado: 0, acumulado_prev: 23, acumulado_real: 0 },
  { mes: 'Abr/25', previsto: 12, realizado: 0, acumulado_prev: 35, acumulado_real: 0 },
  { mes: 'Mai/25', previsto: 10, realizado: 0, acumulado_prev: 45, acumulado_real: 0 },
  { mes: 'Jun/25', previsto: 8, realizado: 0, acumulado_prev: 53, acumulado_real: 0 },
  { mes: 'Jul/25', previsto: 7, realizado: 0, acumulado_prev: 60, acumulado_real: 0 },
  { mes: 'Ago/25', previsto: 7, realizado: 0, acumulado_prev: 67, acumulado_real: 0 },
  { mes: 'Set/25', previsto: 6, realizado: 0, acumulado_prev: 73, acumulado_real: 0 },
  { mes: 'Out/25', previsto: 6, realizado: 0, acumulado_prev: 79, acumulado_real: 0 },
  { mes: 'Nov/25', previsto: 5, realizado: 0, acumulado_prev: 84, acumulado_real: 0 },
  { mes: 'Dez/25', previsto: 4, realizado: 7.89, acumulado_prev: 88, acumulado_real: 7.89 },
  { mes: 'Jan/26', previsto: 4, realizado: 6.67, acumulado_prev: 92, acumulado_real: 14.56 },
  { mes: 'Fev/26', previsto: 4, realizado: 3.44, acumulado_prev: 96, acumulado_real: 18.0 },
  { mes: 'Mar/26', previsto: 4, realizado: null, acumulado_prev: 100, acumulado_real: null },
]

const chartTooltipStyle = {
  backgroundColor: '#0D1421',
  border: '1px solid #1E293B',
  borderRadius: '8px',
  color: '#F1F5F9',
  fontSize: 12,
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/dashboard')
        if (res.ok) {
          const data = await res.json()
          setContratos(data.contratos || [])
          setMedicoesRecentes(data.medicoes_recentes || [])
          setGrupos(data.grupos || [])
        }
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  const totalContratado = contratos.reduce((a, c) => a + (c.valor_contratado || 0), 0)
  const totalMedido = contratos.reduce((a, c) => a + (c.valor_medido || 0), 0)
  const totalSaldo = contratos.reduce((a, c) => a + (c.saldo_restante || 0), 0)
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

  // Build dynamic S-curve by overlaying real measurement totals onto the static scaffold.
  // medicoesRecentes items with status 'aprovado' contribute to the realizado line.
  const curvaSData = useMemo(() => {
    // Accumulate approved measurement values per period label (e.g. "Jan/26")
    const realByPeriod: Record<string, number> = {}
    medicoesRecentes.forEach((m: any) => {
      if (m.status !== 'aprovado' || !m.periodo_referencia || !m.valor_total) return
      const key = m.periodo_referencia as string
      realByPeriod[key] = (realByPeriod[key] || 0) + (m.valor_total as number)
    })
    const hasRealData = Object.keys(realByPeriod).length > 0
    if (!hasRealData) return CURVA_S_DATA

    // Compute a running acumulado for realizado, replacing static values where real data exists
    let acumuladoReal = 0
    return CURVA_S_DATA.map((row) => {
      if (realByPeriod[row.mes] !== undefined) {
        // Use real value — express as a % of totalContratado if available
        const realPct = totalContratado > 0
          ? (realByPeriod[row.mes] / totalContratado) * 100
          : row.realizado ?? 0
        acumuladoReal += realPct
        return { ...row, realizado: realPct, acumulado_real: acumuladoReal }
      }
      // No real data for this month — propagate accumulated or leave null
      if (acumuladoReal > 0) {
        return { ...row, realizado: null, acumulado_real: acumuladoReal }
      }
      return row
    })
  }, [medicoesRecentes, totalContratado])

  const gruposData = grupos.map((g: any) => ({
    nome: g.grupo_nome,
    contratado: g.valor_contratado,
    medido: g.valor_medido,
  }))

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#080C14' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3B82F6' }} />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: '#080C14' }}>
      <Topbar
        title="Dashboard Geral"
        subtitle="Visão consolidada de todos os contratos"
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
              background: '#111827',
              border: '1px solid #1E293B',
              borderBottom: '2px solid rgba(59,130,246,0.40)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d3f5c')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E293B')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Total Contratado
                </p>
                <p className="text-2xl font-bold" style={{ color: '#F1F5F9' }}>
                  {formatCurrency(totalContratado)}
                </p>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>
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
              background: '#111827',
              border: '1px solid #1E293B',
              borderBottom: '2px solid rgba(16,185,129,0.40)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d3f5c')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E293B')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Total Medido
                </p>
                <p className="text-2xl font-bold" style={{ color: '#10B981' }}>
                  {formatCurrency(animatedTotalMedido)}
                </p>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>
                  {totalContratado > 0 ? formatPercent(totalMedido / totalContratado * 100) : '0%'} do total
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(16,185,129,0.15)' }}
              >
                <TrendingUp className="w-5 h-5" style={{ color: '#10B981' }} />
              </div>
            </div>
          </div>

          {/* Saldo Restante */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: '#111827',
              border: '1px solid #1E293B',
              borderBottom: '2px solid rgba(71,85,105,0.60)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d3f5c')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E293B')}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Saldo Restante
                </p>
                <p className="text-2xl font-bold" style={{ color: '#F1F5F9' }}>
                  {formatCurrency(totalSaldo)}
                </p>
                <p className="text-xs mt-1" style={{ color: '#475569' }}>
                  {totalContratado > 0 ? formatPercent(totalSaldo / totalContratado * 100) : '0%'} do total
                </p>
              </div>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(71,85,105,0.20)' }}
              >
                <DollarSign className="w-5 h-5" style={{ color: '#94A3B8' }} />
              </div>
            </div>
          </div>

          {/* Aguardando Aprovação */}
          <div
            className="rounded-xl p-5 transition-all duration-200 cursor-default"
            style={{
              background: '#111827',
              border: `1px solid ${pendentesAprovacao > 0 ? 'rgba(245,158,11,0.30)' : '#1E293B'}`,
              borderBottom: `2px solid ${pendentesAprovacao > 0 ? 'rgba(245,158,11,0.50)' : 'rgba(71,85,105,0.40)'}`,
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#475569' }}>
                  Aguard. Aprovação
                </p>
                <p
                  className="text-2xl font-bold mt-1"
                  style={{ color: pendentesAprovacao > 0 ? '#F59E0B' : '#F1F5F9' }}
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
                  <AlertCircle className="w-5 h-5" style={{ color: '#F59E0B' }} />
                ) : (
                  <CheckCircle2 className="w-5 h-5" style={{ color: '#475569' }} />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Smart Alerts */}
        {alertas.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {alertas.map((a, i) => (
              <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border ${
                a.type === 'danger' ? 'bg-red-900/20 border-red-800/40 text-red-400' :
                a.type === 'warning' ? 'bg-amber-900/20 border-amber-800/40 text-amber-400' :
                'bg-blue-500/10 border-blue-500/20 text-blue-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.type === 'danger' ? 'bg-red-400' : a.type === 'warning' ? 'bg-amber-400' : 'bg-blue-400'
                }`} />
                {a.msg}
              </div>
            ))}
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Curva S */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#111827', border: '1px solid #1E293B' }}
          >
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
                Curva S — Avanço Físico-Financeiro Acumulado (%)
              </h3>
            </div>
            <div className="px-4 pb-5" style={{ background: '#0D1421', margin: '0 12px 12px', borderRadius: '10px' }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    interval={2}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#475569' }}
                    unit="%"
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v) => v !== null ? `${v}%` : 'N/D'}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
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

          {/* Grupos Macro */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#111827', border: '1px solid #1E293B' }}
          >
            <div className="px-5 pt-5 pb-3">
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>
                Medido por Grupo Macro (R$)
              </h3>
            </div>
            <div className="px-4 pb-5" style={{ background: '#0D1421', margin: '0 12px 12px', borderRadius: '10px' }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={gruposData} layout="vertical" margin={{ top: 12, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    width={90}
                    axisLine={{ stroke: '#1E293B' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v) => formatCurrency(v as number)}
                  />
                  <Legend
                    iconSize={10}
                    wrapperStyle={{ fontSize: 11, color: '#94A3B8' }}
                  />
                  <Bar dataKey="contratado" name="Contratado" fill="#1E293B" radius={[0, 3, 3, 0]} />
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
            className="rounded-xl overflow-hidden"
            style={{ background: '#111827', border: '1px solid #1E293B' }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1E293B' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Contratos Ativos</h3>
              <Link href="/contratos">
                <button
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#94A3B8' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#F1F5F9'; e.currentTarget.style.background = '#1a2236' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'transparent' }}
                >
                  Ver todos <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="p-4 space-y-3">
              {contratos.map((c: any) => (
                <Link key={c.contrato_id} href={`/contratos/${c.contrato_id}`}>
                  <div
                    className="p-3 rounded-xl transition-all duration-150 cursor-pointer"
                    style={{
                      background: '#0D1421',
                      border: '1px solid #1E293B',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'rgba(59,130,246,0.50)'
                      e.currentTarget.style.background = '#111827'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = '#1E293B'
                      e.currentTarget.style.background = '#0D1421'
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: '#F1F5F9' }}>{c.numero}</p>
                        <p className="text-xs line-clamp-1 mt-0.5" style={{ color: '#475569' }}>{c.descricao}</p>
                      </div>
                      <Badge className={getContratoStatusColor(c.status)}>
                        {CONTRATO_STATUS_LABELS[c.status as keyof typeof CONTRATO_STATUS_LABELS]}
                      </Badge>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs" style={{ color: '#475569' }}>
                        <span>Avanço financeiro</span>
                        <span className="font-semibold" style={{ color: '#94A3B8' }}>
                          {formatPercent(c.percentual_medido || 0)}
                        </span>
                      </div>
                      {/* Custom progress bar */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1E293B' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(c.percentual_medido || 0, 100)}%`,
                            background: 'linear-gradient(90deg, #2563EB, #06B6D4)',
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span style={{ color: '#475569' }}>
                          Medido:{' '}
                          <span className="font-medium" style={{ color: '#94A3B8' }}>
                            {formatCurrency(c.valor_medido || 0)}
                          </span>
                        </span>
                        <span style={{ color: '#475569' }}>
                          Saldo:{' '}
                          <span className="font-medium" style={{ color: '#94A3B8' }}>
                            {formatCurrency(c.saldo_restante || 0)}
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
            className="rounded-xl overflow-hidden"
            style={{ background: '#111827', border: '1px solid #1E293B' }}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1E293B' }}>
              <h3 className="text-sm font-semibold" style={{ color: '#F1F5F9' }}>Medições Recentes</h3>
              <Link href="/aprovacoes">
                <button
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ color: '#94A3B8' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#F1F5F9'; e.currentTarget.style.background = '#1a2236' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'transparent' }}
                >
                  Fila de aprovação <ArrowRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="p-4">
              <div className="space-y-1">
                {medicoesRecentes.map((m: any) => (
                  <Link key={m.id} href={`/contratos/${m.contrato?.id}/medicoes/${m.id}`}>
                    <div
                      className="flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 cursor-pointer"
                      style={{ border: '1px solid transparent' }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#1a2236'
                        e.currentTarget.style.borderColor = '#1E293B'
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
                          <span className="text-sm font-medium" style={{ color: '#F1F5F9' }}>
                            Medição {m.periodo_referencia}
                          </span>
                          <Badge className={`${getMedicaoStatusColor(m.status as MedicaoStatus)} text-[10px]`}>
                            {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
                          </Badge>
                        </div>
                        <p className="text-xs" style={{ color: '#475569' }}>{m.contrato?.numero}</p>
                      </div>
                      <span className="text-sm font-semibold flex-shrink-0" style={{ color: '#F1F5F9' }}>
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
    </div>
  )
}
