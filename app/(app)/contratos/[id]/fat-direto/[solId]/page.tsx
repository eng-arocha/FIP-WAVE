'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, XCircle, FileText, Plus, Package, Trash2 } from 'lucide-react'
import { usePermissoes } from '@/lib/context/permissoes-context'

interface Solicitacao {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string
  motivo_rejeicao?: string
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  fornecedor_contato?: string
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
  const { perfilAtual } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'
  const [sol, setSol] = useState<Solicitacao | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
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

  async function deletar() {
    if (!confirmDelete) { setConfirmDelete(true); return }
    setActing(true)
    const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push(`/contratos/${id}/fat-direto`)
    } else {
      setErro((await res.json()).error || 'Erro ao deletar')
      setActing(false)
      setConfirmDelete(false)
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Solicitação" />
      <div className="flex-1 flex items-center justify-center text-[var(--text-3)]">Carregando...</div>
    </div>
  )

  if (!sol) return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title="Solicitação" />
      <div className="flex-1 flex items-center justify-center text-[var(--text-3)]">Solicitação não encontrada</div>
    </div>
  )

  const statusColor = STATUS_COLORS[sol.status] ?? '#475569'
  const totalNF = (sol.notas_fiscais || []).reduce((s, n) => s + n.valor, 0)

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar title={`SOL-${String(sol.numero).padStart(3, '0')}`} />
      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
                <ArrowLeft className="w-4 h-4" /> Faturamento Direto
              </Button>
            </Link>
            {isAdmin && (
              <Button
                size="sm"
                variant="ghost"
                onClick={deletar}
                disabled={acting}
                className={confirmDelete ? 'text-white bg-red-600 hover:bg-red-700' : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                {confirmDelete ? 'Confirmar exclusão' : 'Deletar'}
              </Button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>SOL-{String(sol.numero).padStart(3, '0')}</h1>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide"
                  style={{ background: `${statusColor}20`, color: statusColor }}
                >
                  {STATUS_LABELS[sol.status]}
                </span>
              </div>
              <p className="text-sm text-[var(--text-3)]">
                Solicitado por {sol.solicitante?.nome} em {formatDate(sol.data_solicitacao)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-3)] uppercase tracking-wide">Valor Total</p>
            <p className="text-2xl font-black" style={{ color: 'var(--text-1)' }}>{formatCurrency(sol.valor_total)}</p>
          </div>
        </div>

        {/* Supplier info */}
        {sol.fornecedor_razao_social && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium mb-2">Dados do Fornecedor</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><span className="text-[var(--text-3)] text-xs">Razão Social</span><p className="text-[var(--text-1)] font-medium">{sol.fornecedor_razao_social}</p></div>
                {sol.fornecedor_cnpj && <div><span className="text-[var(--text-3)] text-xs">CNPJ</span><p className="text-[var(--text-2)]">{sol.fornecedor_cnpj}</p></div>}
                {sol.fornecedor_contato && <div><span className="text-[var(--text-3)] text-xs">Contato</span><p className="text-[var(--text-2)]">{sol.fornecedor_contato}</p></div>}
              </div>
            </CardContent>
          </Card>
        )}

        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            {erro}
          </div>
        )}

        {/* Approval actions */}
        {sol.status === 'aguardando_aprovacao' && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid #F59E0B40' }}>
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
                  style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rejection reason */}
        {sol.status === 'rejeitado' && sol.motivo_rejeicao && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(239,68,68,0.3)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-red-400 font-semibold uppercase tracking-wide mb-1">Motivo da Rejeição</p>
              <p className="text-sm text-[var(--text-2)]">{sol.motivo_rejeicao}</p>
            </CardContent>
          </Card>
        )}

        {/* Items */}
        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Itens Solicitados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[var(--border)]">
              {(sol.itens || []).map((item, i) => (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>{item.descricao}</p>
                    <p className="text-xs text-[var(--text-3)] mt-0.5">
                      {item.tarefa?.codigo} · Local: {item.local} · Qtde: {item.qtde_solicitada}
                      {' · '}{formatCurrency(item.valor_unitario)}/un
                    </p>
                  </div>
                  <p className="text-sm font-bold ml-4" style={{ color: 'var(--text-1)' }}>{formatCurrency(item.valor_total)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notas Fiscais */}
        <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Notas Fiscais</CardTitle>
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
              <div className="mb-4 p-4 rounded-xl space-y-3" style={{ background: 'var(--background)', border: '1px solid var(--border)' }}>
                <p className="text-xs text-[var(--text-3)] font-semibold uppercase tracking-wide">Nova Nota Fiscal</p>
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
                      <label className="block text-xs text-[var(--text-3)] mb-1">{f.label}</label>
                      <input
                        type={f.type}
                        value={(nfForm as any)[f.key]}
                        onChange={e => setNfForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={registrarNF} disabled={acting} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white">
                    Registrar NF
                  </Button>
                  <Button onClick={() => setShowNFForm(false)} size="sm" variant="ghost" className="text-[var(--text-3)]">
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {(sol.notas_fiscais || []).length === 0 ? (
              <div className="text-center py-6 text-[var(--text-3)] text-sm">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhuma nota fiscal registrada
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)] -mx-5 px-0">
                {(sol.notas_fiscais || []).map(nf => (
                  <div key={nf.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>NF {nf.numero_nf}</p>
                      <p className="text-xs text-[var(--text-3)]">{nf.emitente} · {formatDate(nf.data_emissao)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(nf.valor)}</p>
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
