'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ArrowLeft, FileText, CheckCircle, Clock, XCircle, Package } from 'lucide-react'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string
  solicitante?: { nome: string }
  itens?: Array<{ id: string; descricao: string; qtde_solicitada: number; valor_total: number }>
  notas_fiscais?: Array<{ id: string; valor: number; status: string }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:              { label: 'Rascunho',           color: '#475569', icon: <FileText className="w-3 h-3" /> },
  aguardando_aprovacao:  { label: 'Aguard. Aprovação',  color: '#F59E0B', icon: <Clock className="w-3 h-3" /> },
  aprovado:              { label: 'Aprovado',            color: '#10B981', icon: <CheckCircle className="w-3 h-3" /> },
  rejeitado:             { label: 'Rejeitado',           color: '#EF4444', icon: <XCircle className="w-3 h-3" /> },
  cancelado:             { label: 'Cancelado',           color: '#475569', icon: <XCircle className="w-3 h-3" /> },
}

export default function FatDiretoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/contratos/${id}/fat-direto/solicitacoes`).then(r => r.json()),
    ]).then(([sols]) => {
      setSolicitacoes(Array.isArray(sols) ? sols : [])
      setLoading(false)
    })
  }, [id])

  const totalAprovado = solicitacoes.filter(s => s.status === 'aprovado').reduce((sum, s) => sum + s.valor_total, 0)
  const totalPendente = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((sum, s) => sum + s.valor_total, 0)
  const totalNFs = solicitacoes.reduce((sum, s) => sum + (s.notas_fiscais?.filter(n => n.status !== 'rejeitada').reduce((a, n) => a + n.valor, 0) || 0), 0)

  return (
    <div className="flex flex-col min-h-screen bg-[#080C14]">
      <Topbar title="Faturamento Direto" />
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}`}>
              <Button variant="ghost" size="sm" className="text-[#475569] hover:text-white gap-2">
                <ArrowLeft className="w-4 h-4" /> Contrato
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                Faturamento Direto
              </h1>
              <p className="text-sm text-[#475569]">Controle de autorização de compras de material</p>
            </div>
          </div>
          <Link href={`/contratos/${id}/fat-direto/nova`}>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-500 text-white">
              <Plus className="w-4 h-4" /> Nova Solicitação
            </Button>
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Solicitações', value: solicitacoes.length, type: 'count', color: '#3B82F6' },
            { label: 'Aguardando Aprovação', value: totalPendente, type: 'currency', color: '#F59E0B' },
            { label: 'Total Aprovado', value: totalAprovado, type: 'currency', color: '#10B981' },
            { label: 'NFs Recebidas', value: totalNFs, type: 'currency', color: '#06B6D4' },
          ].map(kpi => (
            <Card key={kpi.label} style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-[#475569] uppercase tracking-wide mb-1">{kpi.label}</p>
                <p className="text-xl font-bold" style={{ color: kpi.color }}>
                  {kpi.type === 'currency' ? formatCurrency(kpi.value as number) : kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Solicitations list */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">Solicitações de Autorização</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12 text-[#475569]">Carregando...</div>
            ) : solicitacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[#475569]">
                <Package className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma solicitação encontrada</p>
                <Link href={`/contratos/${id}/fat-direto/nova`} className="mt-3">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="w-3 h-3" /> Nova Solicitação
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#1E293B]">
                {solicitacoes.map(sol => {
                  const cfg = STATUS_CONFIG[sol.status] ?? STATUS_CONFIG.rascunho
                  const nfTotal = (sol.notas_fiscais || []).filter(n => n.status !== 'rejeitada').reduce((s, n) => s + n.valor, 0)
                  return (
                    <Link key={sol.id} href={`/contratos/${id}/fat-direto/${sol.id}`} className="block">
                      <div className="px-5 py-4 hover:bg-[#111827] transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
                          >
                            <span style={{ color: cfg.color }}>{cfg.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold text-sm">
                                SOL-{String(sol.numero).padStart(3, '0')}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                                style={{ background: `${cfg.color}20`, color: cfg.color }}
                              >
                                {cfg.icon} {cfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-[#475569] mt-0.5">
                              {sol.solicitante?.nome} · {formatDate(sol.data_solicitacao)}
                              {sol.itens && ` · ${sol.itens.length} item(s)`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-bold text-sm">{formatCurrency(sol.valor_total)}</p>
                          {nfTotal > 0 && (
                            <p className="text-xs text-[#06B6D4]">NF: {formatCurrency(nfTotal)}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
