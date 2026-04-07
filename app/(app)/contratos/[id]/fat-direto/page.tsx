'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, ArrowLeft, FileText, CheckCircle, Clock, XCircle, Package, ClipboardList, Timer, BadgeCheck, Receipt, Undo2 } from 'lucide-react'
import { usePermissoes } from '@/lib/context/permissoes-context'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  solicitante?: { nome: string }
  itens?: Array<{ id: string; descricao: string; qtde_solicitada: number; valor_total: number }>
  notas_fiscais?: Array<{ id: string; valor: number; status: string }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  rascunho:              { label: 'Rascunho',           color: 'var(--text-3)', icon: <FileText className="w-3 h-3" /> },
  aguardando_aprovacao:  { label: 'Aguard. Aprovação',  color: 'var(--amber)', icon: <Clock className="w-3 h-3" /> },
  aprovado:              { label: 'Aprovado',            color: 'var(--green)', icon: <CheckCircle className="w-3 h-3" /> },
  rejeitado:             { label: 'Rejeitado',           color: 'var(--red)', icon: <XCircle className="w-3 h-3" /> },
  cancelado:             { label: 'Cancelado',           color: 'var(--text-3)', icon: <XCircle className="w-3 h-3" /> },
}

export default function FatDiretoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { perfilAtual } = usePermissoes()
  const isAdmin = true // TODO: restaurar → perfilAtual === 'admin'
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/contratos/${id}/fat-direto/solicitacoes`).then(r => r.json()),
      fetch(`/api/contratos/${id}`).then(r => r.json()),
    ]).then(([sols, contrato]) => {
      setSolicitacoes(Array.isArray(sols) ? sols : [])
      setResumo(contrato)
      setLoading(false)
    })
  }, [id])

  async function desaprovar(e: React.MouseEvent, solId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Desaprovar esta solicitação?')) return
    await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'aguardando_aprovacao' }),
    })
    // Reload
    const sols = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes`).then(r => r.json())
    setSolicitacoes(Array.isArray(sols) ? sols : [])
  }

  const totalAprovado = solicitacoes.filter(s => s.status === 'aprovado').reduce((sum, s) => sum + s.valor_total, 0)
  const totalPendente = solicitacoes.filter(s => s.status === 'aguardando_aprovacao').reduce((sum, s) => sum + s.valor_total, 0)
  const totalNFs = solicitacoes.reduce((sum, s) => sum + (s.notas_fiscais?.filter(n => n.status !== 'rejeitada').reduce((a, n) => a + n.valor, 0) || 0), 0)
  const teto = resumo?.valor_material_direto ?? 0
  const saldoDisponivel = teto - totalAprovado
  const pctUsado = teto > 0 ? Math.round((totalAprovado / teto) * 100) : 0

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Faturamento Direto" />
      <div className="flex-1 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}`}>
              <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
                <ArrowLeft className="w-4 h-4" /> Contrato
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <Package className="w-5 h-5 text-blue-400" />
                Faturamento Direto
              </h1>
              <p className="text-sm text-[var(--text-3)]">Controle de autorização de compras de material</p>
            </div>
          </div>
          <Link href={`/contratos/${id}/fat-direto/nova`}>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-500 text-white">
              <Plus className="w-4 h-4" /> Nova Solicitação
            </Button>
          </Link>
        </div>

        {/* Teto consumption bar */}
        {teto > 0 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Consumo do Teto de Material</span>
                  <span className="ml-2 text-xs font-bold" style={{ color: pctUsado > 90 ? '#EF4444' : pctUsado > 70 ? '#F59E0B' : '#10B981' }}>
                    {pctUsado}% usado
                  </span>
                </div>
                <span className="text-xs text-[var(--text-3)]">Saldo: <span className="font-bold" style={{ color: saldoDisponivel < 0 ? '#EF4444' : '#10B981' }}>{formatCurrency(saldoDisponivel)}</span></span>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-3)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${Math.min(pctUsado, 100)}%`,
                  background: pctUsado > 90 ? '#EF4444' : pctUsado > 70 ? '#F59E0B' : 'linear-gradient(90deg, #10B981, #06B6D4)',
                }} />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-3)] mt-1">
                <span>Aprovado: {formatCurrency(totalAprovado)}</span>
                <span>Teto: {formatCurrency(teto)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Solicitações', value: solicitacoes.length, type: 'count', color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.20)', Icon: ClipboardList },
            { label: 'Aguardando Aprovação', value: totalPendente, type: 'currency', color: 'var(--amber)', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.20)', Icon: Timer },
            { label: 'Total Aprovado', value: totalAprovado, type: 'currency', color: 'var(--green)', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.20)', Icon: BadgeCheck },
            { label: 'NFs Recebidas', value: totalNFs, type: 'currency', color: '#06B6D4', bg: 'rgba(6,182,212,0.10)', border: 'rgba(6,182,212,0.20)', Icon: Receipt },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-[var(--text-3)] uppercase tracking-wider font-semibold">{kpi.label}</p>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: kpi.bg, border: `1px solid ${kpi.border}` }}>
                    <kpi.Icon className="w-4 h-4" style={{ color: kpi.color }} />
                  </div>
                </div>
                <p className="text-2xl font-bold" style={{ color: kpi.color }}>
                  {kpi.type === 'currency' ? formatCurrency(kpi.value as number) : kpi.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Solicitations list */}
        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base" style={{ color: 'var(--text-1)' }}>Solicitações de Autorização</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12 text-[var(--text-3)]">Carregando...</div>
            ) : solicitacoes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-3)]">
                <Package className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhuma solicitação encontrada</p>
                <Link href={`/contratos/${id}/fat-direto/nova`} className="mt-3">
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-500 text-white gap-2">
                    <Plus className="w-3 h-3" /> Nova Solicitação
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {solicitacoes.map(sol => {
                  const cfg = STATUS_CONFIG[sol.status] ?? STATUS_CONFIG.rascunho
                  const nfTotal = (sol.notas_fiscais || []).filter(n => n.status !== 'rejeitada').reduce((s, n) => s + n.valor, 0)
                  return (
                    <Link key={sol.id} href={`/contratos/${id}/fat-direto/${sol.id}`} className="block">
                      <div className="px-5 py-4 hover:bg-[var(--surface-2)] transition-colors flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}30` }}
                          >
                            <span style={{ color: cfg.color }}>{cfg.icon}</span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                                SOL-{String(sol.numero).padStart(3, '0')}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
                                style={{ background: `${cfg.color}20`, color: cfg.color }}
                              >
                                {cfg.icon} {cfg.label}
                              </span>
                              {isAdmin && sol.status === 'aprovado' && (
                                <button
                                  onClick={e => desaprovar(e, sol.id)}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors"
                                >
                                  Desaprovar
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-[var(--text-3)] mt-0.5">
                              {sol.fornecedor_razao_social
                                ? <span className="text-[var(--text-2)]">{sol.fornecedor_razao_social}</span>
                                : sol.solicitante?.nome
                              }
                              {' · '}{formatDate(sol.data_solicitacao)}
                              {sol.itens && ` · ${sol.itens.length} item(s)`}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-sm" style={{ color: 'var(--text-1)' }}>{formatCurrency(sol.valor_total)}</p>
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
