'use client'

import { use } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  ArrowLeft, Plus, FileText, Building2, Calendar, MapPin,
  ClipboardList, TrendingUp, DollarSign, CheckCircle2, AlertCircle,
  Clock, ChevronRight, Wrench, Layers
} from 'lucide-react'
import {
  formatCurrency, formatPercent, formatDate,
  getContratoStatusColor, getMedicaoStatusColor
} from '@/lib/utils'
import { CONTRATO_STATUS_LABELS, CONTRATO_TIPO_LABELS, MEDICAO_STATUS_LABELS } from '@/types'

const MOCK_CONTRATO = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  numero: 'WAVE-2025-001',
  descricao: 'Contrato de Instalações - Empreendimento Wave',
  escopo: 'Execução completa de instalações elétricas, hidráulicas e de ar-condicionado do empreendimento Wave.',
  objeto: 'Prestação de serviços de instalações prediais completas, incluindo fornecimento de materiais conforme ANEXO II e III.',
  contratante: { nome: 'FIP Engenharia', cnpj: '00.000.000/0001-00' },
  contratado: { nome: 'Wave Instalações SPE LTDA', cnpj: '99.999.999/0001-99' },
  tipo: 'percentual_servico_material' as const,
  status: 'ativo' as const,
  valor_total: 18000000,
  valor_servicos: 6700000,
  valor_material_direto: 11300000,
  data_inicio: '2025-01-01',
  data_fim: '2026-12-31',
  local_obra: 'São Paulo - SP',
  fiscal_obra: 'Eng. João Silva',
  email_fiscal: 'joao.silva@fipengenharia.com.br',
  valor_medido: 3240000,
  saldo: 14760000,
  percentual_medido: 18,
  qtd_medicoes_aprovadas: 3,
  qtd_medicoes_pendentes: 1,
}

const MOCK_GRUPOS = [
  { id: '1', codigo: '1.0', nome: 'Instalações Elétricas', tipo_medicao: 'misto', valor_contratado: 7200000, valor_medido: 1440000 },
  { id: '2', codigo: '2.0', nome: 'Instalações Hidráulicas', tipo_medicao: 'misto', valor_contratado: 5400000, valor_medido: 972000 },
  { id: '3', codigo: '3.0', nome: 'Ar-Condicionado e Ventilação', tipo_medicao: 'misto', valor_contratado: 3600000, valor_medido: 648000 },
  { id: '4', codigo: '4.0', nome: 'SPDA e Aterramento', tipo_medicao: 'servico', valor_contratado: 900000, valor_medido: 108000 },
  { id: '5', codigo: '5.0', nome: 'Gestão e Supervisão', tipo_medicao: 'servico', valor_contratado: 900000, valor_medido: 72000 },
]

const MOCK_MEDICOES = [
  { id: '4', numero: 4, periodo_referencia: '2026-03', tipo: 'misto' as const, status: 'submetido' as const, valor_total: 580000, solicitante_nome: 'Engenheiro Wave', data_submissao: '2026-03-28T10:00:00Z' },
  { id: '3', numero: 3, periodo_referencia: '2026-02', tipo: 'misto' as const, status: 'aprovado' as const, valor_total: 620000, solicitante_nome: 'Engenheiro Wave', data_aprovacao: '2026-03-05T14:30:00Z' },
  { id: '2', numero: 2, periodo_referencia: '2026-01', tipo: 'servico' as const, status: 'aprovado' as const, valor_total: 1200000, solicitante_nome: 'Engenheiro Wave', data_aprovacao: '2026-02-04T11:00:00Z' },
  { id: '1', numero: 1, periodo_referencia: '2025-12', tipo: 'faturamento_direto' as const, status: 'aprovado' as const, valor_total: 1420000, solicitante_nome: 'Engenheiro Wave', data_aprovacao: '2026-01-07T16:00:00Z' },
]

const MOCK_ADITIVOS = [
  // Nenhum aditivo ainda
]

const GRUPOS_CHART = MOCK_GRUPOS.map(g => ({
  nome: g.nome.replace('Instalações ', 'Inst. ').replace('Ar-Condicionado e Ventilação', 'Ar-Cond.').replace('Gestão e Supervisão', 'Gestão'),
  contratado: g.valor_contratado,
  medido: g.valor_medido,
  saldo: g.valor_contratado - g.valor_medido,
}))

export default function ContratoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const contrato = MOCK_CONTRATO

  const TIPO_MEDICAO_COLORS: Record<string, string> = {
    servico: 'bg-purple-100 text-purple-700 border-purple-200',
    faturamento_direto: 'bg-blue-100 text-blue-700 border-blue-200',
    misto: 'bg-teal-100 text-teal-700 border-teal-200',
  }
  const TIPO_MEDICAO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Fat. Direto',
    misto: 'Misto',
  }

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title={contrato.numero}
        subtitle={contrato.descricao}
        actions={
          <div className="flex gap-2">
            <Link href="/contratos">
              <Button variant="outline" size="sm">
                <ArrowLeft className="w-4 h-4" />
                Contratos
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
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Valor Total</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(contrato.valor_total)}</p>
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>Serv: {formatCurrency(contrato.valor_servicos)}</span>
                <span>Mat: {formatCurrency(contrato.valor_material_direto)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Medido</p>
              <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(contrato.valor_medido)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPercent(contrato.percentual_medido)} do total</p>
              <Progress value={contrato.percentual_medido} className="h-1 mt-2" indicatorClassName="bg-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Saldo</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(contrato.saldo)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPercent(100 - contrato.percentual_medido)} restante</p>
            </CardContent>
          </Card>
          <Card className={contrato.qtd_medicoes_pendentes > 0 ? 'border-yellow-300' : ''}>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Medições</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-xl font-bold text-gray-900">{contrato.qtd_medicoes_aprovadas}</p>
                <p className="text-xs text-gray-500 mb-0.5">aprovadas</p>
              </div>
              {contrato.qtd_medicoes_pendentes > 0 && (
                <p className="text-xs text-yellow-600 mt-1 font-medium">{contrato.qtd_medicoes_pendentes} aguardando aprovação</p>
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
            <TabsTrigger value="aditivos">Aditivos {MOCK_ADITIVOS.length > 0 && `(${MOCK_ADITIVOS.length})`}</TabsTrigger>
            <TabsTrigger value="dados">Dados do Contrato</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="visao-geral">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Chart grupos */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Medido vs Contratado por Grupo (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={GRUPOS_CHART} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v) => formatCurrency(v as number)} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="contratado" name="Contratado" fill="#e2e8f0" radius={[0, 2, 2, 0]} />
                      <Bar dataKey="medido" name="Medido" fill="#1e3a5f" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Grupos progress */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Avanço por Grupo Macro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {MOCK_GRUPOS.map(g => {
                    const pct = (g.valor_medido / g.valor_contratado) * 100
                    return (
                      <div key={g.id}>
                        <div className="flex justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500">{g.codigo}</span>
                            <span className="text-xs font-medium text-gray-800">{g.nome}</span>
                            <Badge className={`${TIPO_MEDICAO_COLORS[g.tipo_medicao]} text-[10px]`}>
                              {TIPO_MEDICAO_LABELS[g.tipo_medicao]}
                            </Badge>
                          </div>
                          <span className="text-xs font-bold text-[#1e3a5f]">{formatPercent(pct)}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                          <span>Medido: {formatCurrency(g.valor_medido)}</span>
                          <span>Saldo: {formatCurrency(g.valor_contratado - g.valor_medido)}</span>
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
              <p className="text-sm text-gray-500">{MOCK_MEDICOES.length} medição(ões) registrada(s)</p>
              <Link href={`/contratos/${id}/medicoes/nova`}>
                <Button size="sm">
                  <Plus className="w-4 h-4" />
                  Nova Medição
                </Button>
              </Link>
            </div>
            <div className="space-y-3">
              {MOCK_MEDICOES.map(m => (
                <Link key={m.id} href={`/contratos/${id}/medicoes/${m.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#1e3a5f]/10 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-[#1e3a5f]/60 font-medium">MED</span>
                          <span className="text-base font-bold text-[#1e3a5f] leading-tight">#{String(m.numero).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-900">Medição {m.periodo_referencia}</span>
                            <Badge className={getMedicaoStatusColor(m.status)}>
                              {MEDICAO_STATUS_LABELS[m.status]}
                            </Badge>
                            <Badge className={TIPO_MEDICAO_COLORS[m.tipo]}>
                              {TIPO_MEDICAO_LABELS[m.tipo]}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500">Solicitante: {m.solicitante_nome}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">{formatCurrency(m.valor_total)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {m.status === 'aprovado' && m.data_aprovacao
                              ? `Aprovado em ${formatDate(m.data_aprovacao)}`
                              : m.data_submissao
                              ? `Submetido em ${formatDate(m.data_submissao)}`
                              : ''
                            }
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </TabsContent>

          {/* Estrutura */}
          <TabsContent value="estrutura">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">Estrutura hierárquica do contrato</p>
              <Link href={`/contratos/${id}/estrutura`}>
                <Button variant="outline" size="sm">
                  <Layers className="w-4 h-4" />
                  Gerenciar Estrutura
                </Button>
              </Link>
            </div>
            <div className="space-y-2">
              {MOCK_GRUPOS.map(g => (
                <Card key={g.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="w-10 text-xs font-bold text-gray-400">{g.codigo}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900">{g.nome}</span>
                          <Badge className={TIPO_MEDICAO_COLORS[g.tipo_medicao]}>
                            {TIPO_MEDICAO_LABELS[g.tipo_medicao]}
                          </Badge>
                        </div>
                        <Progress
                          value={(g.valor_medido / g.valor_contratado) * 100}
                          className="h-1 mt-2 max-w-xs"
                        />
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-semibold text-gray-900">{formatCurrency(g.valor_contratado)}</p>
                        <p className="text-gray-400">Medido: {formatCurrency(g.valor_medido)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
            {MOCK_ADITIVOS.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
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
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Número</p>
                    <p className="text-gray-900 font-medium">{contrato.numero}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Tipo</p>
                    <p className="text-gray-900">{CONTRATO_TIPO_LABELS[contrato.tipo]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Contratante</p>
                    <p className="text-gray-900">{contrato.contratante.nome}</p>
                    <p className="text-xs text-gray-400">{contrato.contratante.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Contratado</p>
                    <p className="text-gray-900">{contrato.contratado.nome}</p>
                    <p className="text-xs text-gray-400">{contrato.contratado.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Início</p>
                    <p className="text-gray-900">{formatDate(contrato.data_inicio)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Término</p>
                    <p className="text-gray-900">{formatDate(contrato.data_fim)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Local da Obra</p>
                    <p className="text-gray-900">{contrato.local_obra}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Fiscal de Obra</p>
                    <p className="text-gray-900">{contrato.fiscal_obra}</p>
                    <p className="text-xs text-gray-400">{contrato.email_fiscal}</p>
                  </div>
                  <div className="col-span-2 border-t pt-3">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Objeto</p>
                    <p className="text-gray-700">{contrato.objeto}</p>
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
