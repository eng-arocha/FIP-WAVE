'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from 'recharts'
import {
  TrendingUp, FileText, Clock, CheckCircle2, AlertCircle,
  DollarSign, Building2, Plus, ArrowRight
} from 'lucide-react'
import { formatCurrency, formatPercent, getContratoStatusColor, getMedicaoStatusColor } from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, MEDICAO_STATUS_LABELS, type TipoMedicao, type MedicaoStatus } from '@/types'

// Mock data para demonstração
const MOCK_CONTRATOS = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    numero: 'WAVE-2025-001',
    descricao: 'Contrato de Instalações - Empreendimento Wave',
    contratante: { nome: 'FIP Engenharia' },
    contratado: { nome: 'Wave Instalações SPE LTDA' },
    tipo: 'percentual_servico_material' as const,
    status: 'ativo' as const,
    valor_total: 18000000,
    valor_medido: 3240000,
    saldo: 14760000,
    percentual_medido: 18,
    qtd_medicoes_aprovadas: 3,
    qtd_medicoes_pendentes: 1,
  },
]

const MOCK_MEDICOES_RECENTES: Array<{ id: string; numero: number; periodo_referencia: string; tipo: TipoMedicao; status: MedicaoStatus; valor_total: number; solicitante_nome: string; contrato: { numero: string } }> = [
  { id: '1', numero: 4, periodo_referencia: '2026-03', tipo: 'misto', status: 'submetido', valor_total: 580000, solicitante_nome: 'Engenheiro Wave', contrato: { numero: 'WAVE-2025-001' } },
  { id: '2', numero: 3, periodo_referencia: '2026-02', tipo: 'misto', status: 'aprovado', valor_total: 620000, solicitante_nome: 'Engenheiro Wave', contrato: { numero: 'WAVE-2025-001' } },
  { id: '3', numero: 2, periodo_referencia: '2026-01', tipo: 'servico', status: 'aprovado', valor_total: 1200000, solicitante_nome: 'Engenheiro Wave', contrato: { numero: 'WAVE-2025-001' } },
  { id: '4', numero: 1, periodo_referencia: '2025-12', tipo: 'faturamento_direto', status: 'aprovado', valor_total: 1420000, solicitante_nome: 'Engenheiro Wave', contrato: { numero: 'WAVE-2025-001' } },
]

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

const GRUPOS_DATA = [
  { nome: 'Inst. Elétricas', contratado: 7200000, medido: 1440000 },
  { nome: 'Inst. Hidráulicas', contratado: 5400000, medido: 972000 },
  { nome: 'Ar-Condicionado', contratado: 3600000, medido: 648000 },
  { nome: 'SPDA/Aterramento', contratado: 900000, medido: 108000 },
  { nome: 'Gestão', contratado: 900000, medido: 72000 },
]

export default function DashboardPage() {
  const totalContratado = MOCK_CONTRATOS.reduce((a, c) => a + c.valor_total, 0)
  const totalMedido = MOCK_CONTRATOS.reduce((a, c) => a + c.valor_medido, 0)
  const totalSaldo = MOCK_CONTRATOS.reduce((a, c) => a + c.saldo, 0)
  const pendentesAprovacao = MOCK_MEDICOES_RECENTES.filter(m => m.status === 'submetido' || m.status === 'em_analise').length

  return (
    <div className="flex-1 overflow-auto">
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
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Contratado</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalContratado)}</p>
                  <p className="text-xs text-gray-500 mt-1">{MOCK_CONTRATOS.length} contrato(s) ativo(s)</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Medido</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(totalMedido)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatPercent(totalMedido / totalContratado * 100)} do total</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Saldo Restante</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalSaldo)}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatPercent(totalSaldo / totalContratado * 100)} do total</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={pendentesAprovacao > 0 ? 'border-yellow-300' : ''}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Aguard. Aprovação</p>
                  <p className={`text-2xl font-bold mt-1 ${pendentesAprovacao > 0 ? 'text-yellow-600' : 'text-gray-900'}`}>
                    {pendentesAprovacao}
                  </p>
                  <Link href="/aprovacoes" className="text-xs text-[#1e3a5f] hover:underline mt-1 inline-block">
                    Ver fila →
                  </Link>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${pendentesAprovacao > 0 ? 'bg-yellow-50' : 'bg-gray-50'}`}>
                  {pendentesAprovacao > 0 ? (
                    <AlertCircle className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Curva S */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Curva S — Avanço Físico-Financeiro Acumulado (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={CURVA_S_DATA} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v) => v !== null ? `${v}%` : 'N/D'} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="acumulado_prev" name="Previsto" stroke="#94a3b8" fill="#f1f5f9" strokeDasharray="5 3" strokeWidth={2} />
                  <Area type="monotone" dataKey="acumulado_real" name="Realizado" stroke="#1e3a5f" fill="#dbeafe" strokeWidth={2} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Grupos Macro */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Medido por Grupo Macro (R$)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={GRUPOS_DATA} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={90} />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="contratado" name="Contratado" fill="#e2e8f0" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="medido" name="Medido" fill="#1e3a5f" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Contratos + Medições recentes */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Contratos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Contratos Ativos</CardTitle>
              <Link href="/contratos">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  Ver todos <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-3">
              {MOCK_CONTRATOS.map((c) => (
                <Link key={c.id} href={`/contratos/${c.id}`}>
                  <div className="p-3 rounded-lg border border-gray-100 hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm text-gray-900">{c.numero}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{c.descricao}</p>
                      </div>
                      <Badge className={getContratoStatusColor(c.status)}>
                        {CONTRATO_STATUS_LABELS[c.status]}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Avanço financeiro</span>
                        <span className="font-medium text-gray-700">{formatPercent(c.percentual_medido)}</span>
                      </div>
                      <Progress value={c.percentual_medido} className="h-1.5" />
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-gray-500">Medido: <span className="font-medium text-gray-700">{formatCurrency(c.valor_medido)}</span></span>
                        <span className="text-gray-500">Saldo: <span className="font-medium text-gray-700">{formatCurrency(c.saldo)}</span></span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Medições Recentes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Medições Recentes</CardTitle>
              <Link href="/aprovacoes">
                <Button variant="ghost" size="sm" className="text-xs h-7">
                  Fila de aprovação <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {MOCK_MEDICOES_RECENTES.map((m) => (
                  <Link key={m.id} href={`/contratos/${MOCK_CONTRATOS[0].id}/medicoes/${m.id}`}>
                    <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer border border-transparent hover:border-gray-200">
                      <div className="w-9 h-9 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#1e3a5f]">#{String(m.numero).padStart(2, '0')}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">Medição {m.periodo_referencia}</span>
                          <Badge className={`${getMedicaoStatusColor(m.status)} text-[10px]`}>
                            {MEDICAO_STATUS_LABELS[m.status]}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500">{m.contrato.numero}</p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{formatCurrency(m.valor_total)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
