'use client'

import { use, useState, useEffect } from 'react'
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
  ArrowLeft, Plus, FileText, Loader2,
  ChevronRight, Layers
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
    servico: 'bg-purple-100 text-purple-700 border-purple-200',
    faturamento_direto: 'bg-blue-100 text-blue-700 border-blue-200',
    misto: 'bg-teal-100 text-teal-700 border-teal-200',
  }
  const TIPO_MEDICAO_LABELS: Record<string, string> = {
    servico: 'Serviço',
    faturamento_direto: 'Fat. Direto',
    misto: 'Misto',
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <Topbar title="Carregando..." subtitle="" />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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

  const gruposChart = grupos.map(g => ({
    nome: g.nome.replace('Instalações ', 'Inst. ').replace('Ar-Condicionado e Ventilação', 'Ar-Cond.').replace('Gestão e Supervisão', 'Gestão'),
    contratado: g.valor_contratado,
    medido: g.valor_medido,
    saldo: g.valor_contratado - g.valor_medido,
  }))

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
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(valorTotal)}</p>
              <div className="flex gap-3 mt-2 text-xs text-gray-500">
                <span>Serv: {formatCurrency(contrato.valor_servicos ?? 0)}</span>
                <span>Mat: {formatCurrency(contrato.valor_material_direto ?? 0)}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Medido</p>
              <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(valorMedido)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPercent(percentualMedido)} do total</p>
              <Progress value={percentualMedido} className="h-1 mt-2" indicatorClassName="bg-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Saldo</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{formatCurrency(saldo)}</p>
              <p className="text-xs text-gray-500 mt-1">{formatPercent(100 - percentualMedido)} restante</p>
            </CardContent>
          </Card>
          <Card className={qtdPendentes > 0 ? 'border-yellow-300' : ''}>
            <CardContent className="pt-5">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Medições</p>
              <div className="flex items-end gap-2 mt-1">
                <p className="text-xl font-bold text-gray-900">{qtdAprovadas}</p>
                <p className="text-xs text-gray-500 mb-0.5">aprovadas</p>
              </div>
              {qtdPendentes > 0 && (
                <p className="text-xs text-yellow-600 mt-1 font-medium">{qtdPendentes} aguardando aprovação</p>
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
                  <CardTitle className="text-sm">Medido vs Contratado por Grupo (R$)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={gruposChart} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
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
                  {grupos.map(g => {
                    const pct = g.valor_contratado > 0 ? (g.valor_medido / g.valor_contratado) * 100 : 0
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
              <p className="text-sm text-gray-500">{medicoes.length} medição(ões) registrada(s)</p>
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
                        <div className="w-12 h-12 rounded-xl bg-[#1e3a5f]/10 flex flex-col items-center justify-center flex-shrink-0">
                          <span className="text-[10px] text-[#1e3a5f]/60 font-medium">MED</span>
                          <span className="text-base font-bold text-[#1e3a5f] leading-tight">#{String(m.numero).padStart(2, '0')}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-900">Medição {m.periodo_referencia}</span>
                            <Badge className={getMedicaoStatusColor(m.status as MedicaoStatus)}>
                              {MEDICAO_STATUS_LABELS[m.status as MedicaoStatus]}
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
              {grupos.map(g => (
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
                          value={g.valor_contratado > 0 ? (g.valor_medido / g.valor_contratado) * 100 : 0}
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
            {aditivos.length === 0 ? (
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
                    <p className="text-gray-900">{CONTRATO_TIPO_LABELS[contrato.tipo as ContratoTipo]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Contratante</p>
                    <p className="text-gray-900">{contrato.contratante?.nome}</p>
                    <p className="text-xs text-gray-400">{contrato.contratante?.cnpj}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Contratado</p>
                    <p className="text-gray-900">{contrato.contratado?.nome}</p>
                    <p className="text-xs text-gray-400">{contrato.contratado?.cnpj}</p>
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
