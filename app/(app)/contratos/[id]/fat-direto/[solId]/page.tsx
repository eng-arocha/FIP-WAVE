'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, XCircle, FileText, Plus, Package } from 'lucide-react'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string
  motivo_rejeicao?: string
  solicitante?: { nome: string; email: string }
  aprovador?: { nome: string; email: string }
  itens?: Array<{
    id: string
    descricao: string
    local: string
    qtde_solicitada: number
    valor_unitario: number
    valor_total: number
    tarefa?: { codigo: string; nome: string }
  }>
  notas_fiscais?: Array<{
    id: string
    numero_nf: string
    emitente: string
    valor: number
    data_emissao: string
    status: string
  }>
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: '#475569',
  aguardando_aprovacao: '#F59E0B',
  aprovado: '#10B981',
  rejeitado: '#EF4444',
  cancelado: '#475569',
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
}

export default function SolicitacaoDetailPage({ params }: { params: Promise<{ id: string; solId: string }> }) {
  const { id, solId } = use(params)
  const router = useRouter()
  const [sol, setSol] = useState<Solicitacao | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showNFForm, setShowNFForm] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nfForm, setNfForm] = useState({ numero_nf: '', emitente: '', cnpj_emitente: '', valor: '', data_emissao: '', descricao: '' })
  const [erro, setErro] = useState('')

  async function load() {
    const data = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}`).then(r => r.json())
    setSol(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [solId])

  async function acao(a: 'aprovado' | 'rejeitado' | 'cancelado') {
    setActing(true)
    setErro('')
    const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: a, motivo_rejeicao: motivo }),
    })
    if (!res.ok) { setErro((await res.json()).error); setActing(false); return }
    await load()
    setActing(false)
  }

  async function registrarNF() {
    setErro('')
    if (!nfForm.numero_nf || !nfForm.emitente || !nfForm.valor || !nfForm.data_emissao) {
      setErro('Preencha todos os campos obrigatórios da NF.')
      return
    }
    setActing(true)
    const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/nfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...nfForm, valor: parseFloat(nfForm.valor) }),
    })
    if (!res.ok) { setErro((await res.json()).error); setActing(false); return }
    setNfForm({ numero_nf: '', emitente: '', cnpj_emitente: '', valor: '', data_emissao: '', descricao: '' })
    setShowNFForm(false)
    await load()
    setActing(false)
  }

  if (loading) return (
    <div className="flex flex-col min-h-screen bg-[#080C14]">
      <Topbar title="Solicitação" />
      <div className="flex-1 flex items-center justify-center text-[#475569]">Carregando...</div>
    </div>
  )

  if (!sol) return (
    <div className="flex flex-col min-h-screen bg-[#080C14]">
      <Topbar title="Solicitação" />
      <div className="flex-1 flex items-center justify-center text-[#475569]">Solicitação não encontrada</div>
    </div>
  )

  const statusColor = STATUS_COLORS[sol.status] ?? '#475569'
  const totalNF = (sol.notas_fiscais || []).reduce((s, n) => s + n.valor, 0)

  return (
    <div className="flex flex-col min-h-screen bg-[#080C14]">
      <Topbar title={`SOL-${String(sol.numero).padStart(3, '0')}`} />
      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="ghost" size="sm" className="text-[#475569] hover:text-white gap-2">
                <ArrowLeft className="w-4 h-4" /> Faturamento Direto
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white">SOL-{String(sol.numero).padStart(3, '0')}</h1>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
                  style={{ background: `${statusColor}20`, color: statusColor }}
                >
                  {STATUS_LABELS[sol.status]}
                </span>
              </div>
              <p className="text-sm text-[#475569]">
                Solicitado por {sol.solicitante?.nome} em {formatDate(sol.data_solicitacao)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[#475569] uppercase tracking-wide">Valor Total</p>
            <p className="text-2xl font-black text-white">{formatCurrency(sol.valor_total)}</p>
          </div>
        </div>

        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            {erro}
          </div>
        )}

        {/* Approval actions */}
        {sol.status === 'aguardando_aprovacao' && (
          <Card style={{ background: '#0D1421', border: '1px solid #F59E0B40' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-[#F59E0B] font-semibold mb-3">Ação de Aprovação WAVE</p>
              <div className="space-y-2">
                <div className="flex gap-3">
                  <Button
                    onClick={() => acao('aprovado')}
                    disabled={acting}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    <CheckCircle className="w-4 h-4" /> Aprovar
                  </Button>
                  <Button
                    onClick={() => acao('rejeitado')}
                    disabled={acting || !motivo.trim()}
                    variant="ghost"
                    className="gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <XCircle className="w-4 h-4" /> Rejeitar
                  </Button>
                </div>
                <input
                  type="text"
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Motivo da rejeição (obrigatório para rejeitar)..."
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: '#080C14', border: '1px solid #1E293B', color: '#F1F5F9' }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rejection reason */}
        {sol.status === 'rejeitado' && sol.motivo_rejeicao && (
          <Card style={{ background: '#0D1421', border: '1px solid rgba(239,68,68,0.3)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-red-400 font-semibold uppercase tracking-wide mb-1">Motivo da Rejeição</p>
              <p className="text-sm text-[#94A3B8]">{sol.motivo_rejeicao}</p>
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Itens Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#1E293B]">
              {(sol.itens || []).map((item, i) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white font-medium">{item.descricao}</p>
                    <p className="text-xs text-[#475569] mt-0.5">
                      {item.tarefa?.codigo} · Local: {item.local} · Qtde: {item.qtde_solicitada}
                      {' · '}{formatCurrency(item.valor_unitario)}/un
                    </p>
                  </div>
                  <p className="text-sm font-bold text-white ml-4">{formatCurrency(item.valor_total)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notas Fiscais */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-white text-sm">Notas Fiscais</CardTitle>
              {totalNF > 0 && <p className="text-xs text-[#06B6D4] mt-0.5">Total recebido: {formatCurrency(totalNF)}</p>}
            </div>
            {sol.status === 'aprovado' && (
              <Button
                onClick={() => setShowNFForm(v => !v)}
                size="sm"
                variant="ghost"
                className="text-blue-400 hover:text-blue-300 gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Registrar NF
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {showNFForm && (
              <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: '#080C14', border: '1px solid #1E293B' }}>
                <p className="text-xs text-[#475569] font-semibold uppercase tracking-wide">Nova Nota Fiscal</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Número NF', key: 'numero_nf', type: 'text' },
                    { label: 'Emitente', key: 'emitente', type: 'text' },
                    { label: 'CNPJ Emitente', key: 'cnpj_emitente', type: 'text' },
                    { label: 'Valor (R$)', key: 'valor', type: 'number' },
                    { label: 'Data Emissão', key: 'data_emissao', type: 'date' },
                    { label: 'Descrição', key: 'descricao', type: 'text' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-[#475569] mb-1">{f.label}</label>
                      <input
                        type={f.type}
                        value={(nfForm as any)[f.key]}
                        onChange={e => setNfForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={{ background: '#0D1421', border: '1px solid #1E293B', color: '#F1F5F9' }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={registrarNF} disabled={acting} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                    Registrar NF
                  </Button>
                  <Button onClick={() => setShowNFForm(false)} size="sm" variant="ghost" className="text-[#475569]">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {(sol.notas_fiscais || []).length === 0 ? (
              <div className="text-center py-6 text-[#475569] text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma nota fiscal registrada
              </div>
            ) : (
              <div className="divide-y divide-[#1E293B] -mx-5 px-0">
                {(sol.notas_fiscais || []).map(nf => (
                  <div key={nf.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white font-medium">NF {nf.numero_nf}</p>
                      <p className="text-xs text-[#475569]">{nf.emitente} · {formatDate(nf.data_emissao)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{formatCurrency(nf.valor)}</p>
                      <span className="text-xs" style={{ color: nf.status === 'validada' ? '#10B981' : '#F59E0B' }}>
                        {nf.status === 'validada' ? 'Validada' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
