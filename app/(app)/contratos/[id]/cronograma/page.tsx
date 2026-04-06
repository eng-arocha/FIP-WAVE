'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, TrendingUp, Calendar } from 'lucide-react'

interface CurvaSPoint {
  mes: string
  planejado_fisico: number
  planejado_fatd: number
  planejado_total: number
  realizado_fisico: number
  realizado_fatd: number
  realizado_total: number
  planejado_fisico_acum: number
  planejado_fatd_acum: number
  planejado_total_acum: number
  realizado_fisico_acum: number
  realizado_fatd_acum: number
  realizado_total_acum: number
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  const months = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(m)]}/${y.slice(2)}`
}

export default function CronogramaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<CurvaSPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'acumulado' | 'mensal'>('acumulado')
  const [tipo, setTipo] = useState<'total' | 'servico' | 'material'>('total')

  useEffect(() => {
    fetch(`/api/contratos/${id}/cronograma`)
      .then(r => r.json())
      .then(d => { setData(Array.isArray(d) ? d : []); setLoading(false) })
  }, [id])

  const chartData = data.map(d => {
    const suffix = view === 'acumulado' ? '_acum' : ''
    const planKey = tipo === 'total' ? `planejado_total${suffix}` :
      tipo === 'servico' ? `planejado_fisico${suffix}` : `planejado_fatd${suffix}`
    const realKey = tipo === 'total' ? `realizado_total${suffix}` :
      tipo === 'servico' ? `realizado_fisico${suffix}` : `realizado_fatd${suffix}`
    return {
      mes: formatMes(d.mes),
      'Planejado': (d as any)[planKey] ?? 0,
      'Realizado': (d as any)[realKey] ?? 0,
    }
  })

  // KPIs
  const lastPoint = data[data.length - 1]
  const totalPlanejado = lastPoint?.planejado_total_acum ?? 0
  const totalPlanejadoFis = lastPoint?.planejado_fisico_acum ?? 0
  const totalPlanejadoFatD = lastPoint?.planejado_fatd_acum ?? 0

  // Find peak month
  const peakMonth = data.reduce((best, d) => d.planejado_total > best.planejado_total ? d : best, data[0] ?? {} as CurvaSPoint)

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Cronograma Físico-Financeiro" />
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/contratos/${id}`}>
            <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
              <ArrowLeft className="w-4 h-4" /> Contrato
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <TrendingUp className="w-5 h-5 text-blue-400" />
              Cronograma Físico-Financeiro
            </h1>
            <p className="text-sm text-[var(--text-3)]">Curva S — Planejado vs. Realizado · Mar/26 → Out/27</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Total Planejado</p>
              <p className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalPlanejado)}</p>
            </CardContent>
          </Card>
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Serviço Planejado</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(totalPlanejadoFis)}</p>
            </CardContent>
          </Card>
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide mb-1">Material Planejado</p>
              <p className="text-xl font-bold text-cyan-400">{formatCurrency(totalPlanejadoFatD)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(['acumulado', 'mensal'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{
                  background: view === v ? 'rgba(59,130,246,0.20)' : 'transparent',
                  color: view === v ? 'var(--accent)' : 'var(--text-3)',
                }}
              >
                {v === 'acumulado' ? 'Curva S (Acum.)' : 'Mensal'}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {([['total', 'Total'], ['servico', 'Serviço'], ['material', 'Material']] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTipo(v)}
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
                style={{
                  background: tipo === v ? 'rgba(59,130,246,0.20)' : 'transparent',
                  color: tipo === v ? 'var(--accent)' : 'var(--text-3)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Curva S Chart */}
        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <TrendingUp className="w-4 h-4 text-blue-400" />
              Curva S — {view === 'acumulado' ? 'Acumulado' : 'Mensal'} ·{' '}
              {tipo === 'total' ? 'Total' : tipo === 'servico' ? 'Serviço (MDO)' : 'Material (Fat. Direto)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">Carregando dados...</div>
            ) : chartData.length === 0 ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">
                Nenhum dado de planejamento encontrado. Execute a Migration 005 primeiro.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={380}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={1}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-3)', fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `R$${(v / 1e6).toFixed(1)}M`}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text-1)' }}
                    formatter={(value: any) => formatCurrency(Number(value))}
                    labelStyle={{ color: 'var(--text-2)', marginBottom: 4 }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: 16 }}
                    formatter={v => <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{v}</span>}
                  />
                  <Area
                    type="monotone"
                    dataKey="Planejado"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill="url(#colorPlan)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#3B82F6' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="Realizado"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill="url(#colorReal)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#10B981' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Monthly breakdown table */}
        {!loading && data.length > 0 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <Calendar className="w-4 h-4 text-blue-400" />
                Desembolso Mensal Planejado
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
                      <th className="px-4 py-2.5 text-left text-[var(--text-3)] font-semibold uppercase tracking-wide">Mês</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Serviço</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Material</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Total</th>
                      <th className="px-4 py-2.5 text-right text-[var(--text-3)] font-semibold uppercase tracking-wide">Acum. Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={row.mes} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-2.5 text-[var(--text-2)] font-medium">{formatMes(row.mes)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: 'var(--accent)' }}>{formatCurrency(row.planejado_fisico)}</td>
                        <td className="px-4 py-2.5 text-right" style={{ color: 'var(--accent-glow)' }}>{formatCurrency(row.planejado_fatd)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold" style={{ color: 'var(--text-1)' }}>{formatCurrency(row.planejado_total)}</td>
                        <td className="px-4 py-2.5 text-right text-[var(--text-2)]">{formatCurrency(row.planejado_total_acum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
