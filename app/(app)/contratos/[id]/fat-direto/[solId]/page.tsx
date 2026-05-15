'use client'

import { use, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle, XCircle, FileText, Plus, Package, Trash2, Mail, Send, PlayCircle, RotateCcw, Ban } from 'lucide-react'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { EmailEnvolvidosModal } from '@/components/fat-direto/email-envolvidos-modal'
import { EncerrarPedidoModal } from '@/components/fat-direto/encerrar-pedido-modal'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Solicitacao {
  id: string
  numero: number
  contrato_id: string
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
    valor_devolvido?: number
    tarefa?: { codigo: string; nome: string }
  }>
  notas_fiscais?: Array<{
    id: string
    numero_nf: string
    emitente: string
    cnpj_emitente?: string | null
    valor: number
    data_emissao: string
    data_recebimento?: string | null
    data_vencimento?: string | null
    descricao?: string | null
    status: string
    motivo_rejeicao?: string | null
    arquivo_url?: string | null
    lancado_em?: string | null
  }>
}

// ── Badges de status da NF (workflow de aprovação — migration 065) ──────────
const NF_STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  aguardando_aprovacao: { label: 'Aguardando aprovação', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  aprovada:             { label: 'Aprovada',             color: '#10B981', bg: 'rgba(16,185,129,0.14)' },
  em_correcao:          { label: 'Em correção',          color: '#EF4444', bg: 'rgba(239,68,68,0.14)' },
  cancelada:            { label: 'Cancelada',            color: '#64748B', bg: 'rgba(100,116,139,0.14)' },
  // Legados (pré-065) — exibidos só se a migration ainda não rodou.
  validada:             { label: 'Aprovada',             color: '#10B981', bg: 'rgba(16,185,129,0.14)' },
  pendente:             { label: 'Aguardando aprovação', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' },
  rejeitada:            { label: 'Cancelada',            color: '#64748B', bg: 'rgba(100,116,139,0.14)' },
}

function nfStatusBadge(status: string) {
  return NF_STATUS_BADGE[status] ?? { label: status, color: '#64748B', bg: 'rgba(100,116,139,0.14)' }
}

const STATUS_COLORS: Record<string, string> = {
  rascunho: '#475569',
  aguardando_aprovacao: '#F59E0B',
  aprovado: '#10B981',
  rejeitado: '#EF4444',
  cancelado: '#475569',
  encerrado: '#6366F1',
}

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando Aprovação',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
  encerrado: 'Encerrado',
}

const MOTIVO_PADRAO_ENCERRAMENTO =
  'fornecedor confirmou que não emitirá mais NF — material concluído com NFs já lançadas'

export default function SolicitacaoDetailPage({ params }: { params: Promise<{ id: string; solId: string }> }) {
  const { id, solId } = use(params)
  const router = useRouter()
  const { perfilAtual } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'
  const [sol, setSol] = useState<Solicitacao | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancelar, setConfirmCancelar] = useState(false)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showNFForm, setShowNFForm] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [nfForm, setNfForm] = useState({ numero_nf: '', emitente: '', cnpj_emitente: '', valor: '', data_emissao: '', descricao: '' })
  const [erro, setErro] = useState('')
  // Correção de NF em em_correcao — id da NF sendo corrigida + formulário pré-preenchido.
  const [corrigindoNfId, setCorrigindoNfId] = useState<string | null>(null)
  const [corrForm, setCorrForm] = useState({
    numero_nf: '', emitente: '', cnpj_emitente: '', valor: '',
    data_emissao: '', data_recebimento: '', data_vencimento: '', descricao: '',
  })
  const [corrErro, setCorrErro] = useState('')
  // Dialog de aprovação: pergunta se quer aprovar (com ou sem notificação)
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [showEncerrarModal, setShowEncerrarModal] = useState(false)
  // Lista de envolvidos do contrato pra modal de encerramento (notificação por email)
  const [envolvidosContrato, setEnvolvidosContrato] = useState<Array<{ id: string; nome: string | null; email: string }>>([])
  // Modal de envio de notificação aos envolvidos (checkbox + preview)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailModalMode, setEmailModalMode] = useState<'aprovar' | 'reenviar'>('aprovar')
  const [emailSucesso, setEmailSucesso] = useState('')
  // Modal de "Solicitar encerramento de saldo" — fluxo do solicitante (não admin)
  const [showSolicitarEncerramento, setShowSolicitarEncerramento] = useState(false)
  const [motivoEncerramento, setMotivoEncerramento] = useState('')
  const [enviandoEncerramento, setEnviandoEncerramento] = useState(false)
  const [erroEncerramento, setErroEncerramento] = useState('')
  const [encerramentoSucesso, setEncerramentoSucesso] = useState('')
  // P2.9/P2.1: saldo do pedido pra alertar >95% e bloquear envio a esgotado
  const [saldo, setSaldo] = useState<{
    pedido_valor: number
    total_nf_validadas: number
    total_nf_pendentes: number
    saldo_liquido: number
    pct_utilizado: number
    alerta: 'ok' | 'atencao' | 'critico' | 'esgotado'
    pedido?: { fornecedor_cnpj?: string | null; fornecedor_razao_social?: string | null }
  } | null>(null)

  async function carregarSaldo() {
    try {
      const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/saldo`)
      if (!res.ok) return
      const data = await res.json()
      setSaldo({
        pedido_valor: data.pedido?.valor_total ?? 0,
        total_nf_validadas: data.total_nf_validadas,
        total_nf_pendentes: data.total_nf_pendentes,
        saldo_liquido: data.saldo_liquido,
        pct_utilizado: data.pct_utilizado,
        alerta: data.alerta,
        pedido: data.pedido,
      })
    } catch {/* noop */}
  }

  async function load() {
    try {
      const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}`)
      const data = await res.json()
      // API retorna {error: ...} em caso de falha — não setar como sol (quebra a UI com NaN/undefined)
      if (!res.ok || !data?.id) {
        setSol(null)
        setErro(data?.error || 'Erro ao carregar solicitação.')
      } else {
        setSol(data)
      }
    } catch (e: any) {
      setSol(null)
      setErro(e?.message || 'Erro ao carregar solicitação.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(); carregarSaldo() }, [solId])

  // Recarrega saldo quando abre o formulário de NF — mostra estado atualizado
  useEffect(() => { if (showNFForm) carregarSaldo() }, [showNFForm])

  // Carrega envolvidos do contrato uma vez quando modal de encerramento abre
  // (reutiliza email-preview que já retorna a lista junto)
  useEffect(() => {
    if (!showEncerrarModal || envolvidosContrato.length > 0) return
    fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/email-preview`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.envolvidos && Array.isArray(data.envolvidos)) {
          setEnvolvidosContrato(data.envolvidos)
        }
      })
      .catch(() => {/* lista vazia segue OK */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEncerrarModal])

  // Auto-preencher CNPJ do emitente com o do fornecedor do pedido (se houver)
  useEffect(() => {
    if (showNFForm && saldo?.pedido?.fornecedor_cnpj && !nfForm.cnpj_emitente) {
      setNfForm(prev => ({
        ...prev,
        cnpj_emitente: saldo.pedido!.fornecedor_cnpj || '',
        emitente: prev.emitente || saldo.pedido!.fornecedor_razao_social || '',
      }))
    }
  }, [showNFForm, saldo])

  async function acao(
    a: 'aprovado' | 'rejeitado' | 'cancelado' | 'aguardando_aprovacao',
  ) {
    setActing(true)
    setErro('')
    const body: any = { acao: a, motivo_rejeicao: motivo }
    // Nota: quando acao='aprovado' sem destinatarios_ids → só aprova, não manda email.
    // Se quiser aprovar + notificar, usa o EmailEnvolvidosModal (que manda o POST com destinatarios_ids).
    const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/aprovar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { setErro((await res.json()).error); setActing(false); return }
    setShowApprovalDialog(false)
    await load()
    setActing(false)
  }

  async function registrarNF() {
    setErro('')
    if (!nfForm.numero_nf || !nfForm.emitente || !nfForm.valor || !nfForm.data_emissao) {
      setErro('Preencha todos os campos obrigatórios da NF.')
      return
    }
    if (saldo?.alerta === 'esgotado') {
      setErro('O pedido já está 100% utilizado. Não é possível lançar mais NFs.')
      return
    }
    setActing(true)
    // Remove campos opcionais vazios pra nao falhar validacao server-side
    // (cnpj_emitente='' transformava em string vazia e refine '14 digitos'
    // falhava; data_recebimento='' falhava no regex YYYY-MM-DD).
    const payload: Record<string, unknown> = {
      numero_nf: nfForm.numero_nf,
      emitente: nfForm.emitente,
      valor: parseFloat(nfForm.valor),
      data_emissao: nfForm.data_emissao,
    }
    if (nfForm.cnpj_emitente && nfForm.cnpj_emitente.trim()) payload.cnpj_emitente = nfForm.cnpj_emitente
    if (nfForm.descricao && nfForm.descricao.trim()) payload.descricao = nfForm.descricao
    const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}/nfs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      // 422 com code do 3-way match → mensagem mais explícita
      try {
        const body = await res.json()
        const prefix = body.code ? `[${body.code}] ` : ''
        setErro(prefix + (body.error || 'Erro ao registrar NF.'))
      } catch {
        setErro('Erro ao registrar NF.')
      }
      setActing(false)
      return
    }
    setNfForm({ numero_nf: '', emitente: '', cnpj_emitente: '', valor: '', data_emissao: '', descricao: '' })
    setShowNFForm(false)
    await load()
    await carregarSaldo()
    setActing(false)
  }

  /** Abre o formulário de correção pré-preenchido com os dados da NF rejeitada. */
  function abrirCorrecao(nf: NonNullable<Solicitacao['notas_fiscais']>[number]) {
    setCorrErro('')
    setCorrigindoNfId(nf.id)
    setCorrForm({
      numero_nf: nf.numero_nf ?? '',
      emitente: nf.emitente ?? '',
      cnpj_emitente: nf.cnpj_emitente ?? '',
      valor: nf.valor != null ? String(nf.valor) : '',
      data_emissao: (nf.data_emissao ?? '').slice(0, 10),
      data_recebimento: (nf.data_recebimento ?? '').slice(0, 10),
      data_vencimento: (nf.data_vencimento ?? '').slice(0, 10),
      descricao: nf.descricao ?? '',
    })
  }

  /** Reenvia a NF corrigida via PATCH — volta para aguardando_aprovacao. */
  async function reenviarNf(nfId: string) {
    setCorrErro('')
    if (!corrForm.numero_nf || !corrForm.valor || !corrForm.data_emissao) {
      setCorrErro('Preencha os campos obrigatórios: Número NF, Valor e Data Emissão.')
      return
    }
    setActing(true)
    const payload: Record<string, unknown> = {
      numero_nf: corrForm.numero_nf,
      valor: parseFloat(corrForm.valor),
      data_emissao: corrForm.data_emissao,
    }
    if (corrForm.emitente.trim())         payload.emitente = corrForm.emitente.trim()
    if (corrForm.cnpj_emitente.trim())    payload.cnpj_emitente = corrForm.cnpj_emitente.trim()
    if (corrForm.data_recebimento.trim()) payload.data_recebimento = corrForm.data_recebimento
    if (corrForm.data_vencimento.trim())  payload.data_vencimento = corrForm.data_vencimento
    if (corrForm.descricao.trim())        payload.descricao = corrForm.descricao.trim()
    try {
      const res = await fetch(
        `/api/contratos/${id}/fat-direto/solicitacoes/${solId}/nfs/${nfId}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      )
      if (!res.ok) {
        // 422 do 3-way match → mostra o code + mensagem (saldo, duplicata, CNPJ...).
        const body = await res.json().catch(() => ({}))
        const prefix = body.code ? `[${body.code}] ` : ''
        setCorrErro(prefix + (body.error || 'Erro ao reenviar a NF.'))
        return
      }
      setCorrigindoNfId(null)
      await load()
      await carregarSaldo()
    } catch (e: any) {
      setCorrErro(e?.message || 'Erro ao reenviar a NF.')
    } finally {
      setActing(false)
    }
  }

  /**
   * Cancela o pedido (status → 'cancelado'). Diferente de Excluir: não apaga
   * o registro, só marca como cancelado. Pode ser reaberto depois ("Enviar
   * para análise"). Exige confirmação explícita em dois cliques.
   */
  async function cancelarPedido() {
    if (!confirmCancelar) { setConfirmCancelar(true); return }
    setConfirmCancelar(false)
    await acao('cancelado')
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

  function abrirSolicitarEncerramento() {
    setMotivoEncerramento(MOTIVO_PADRAO_ENCERRAMENTO)
    setErroEncerramento('')
    setShowSolicitarEncerramento(true)
  }

  async function confirmarSolicitacaoEncerramento() {
    if (!motivoEncerramento.trim()) {
      setErroEncerramento('Informe o motivo da solicitação.')
      return
    }
    setEnviandoEncerramento(true)
    setErroEncerramento('')
    try {
      const res = await fetch(`/api/contratos/${id}/encerramento-saldo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitacao_fat_direto_id: solId,
          motivo: motivoEncerramento.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroEncerramento(body?.error || `Falha (HTTP ${res.status}).`)
        return
      }
      setShowSolicitarEncerramento(false)
      setMotivoEncerramento('')
      setEncerramentoSucesso('Solicitação enviada! O aprovador será notificado.')
      window.setTimeout(() => setEncerramentoSucesso(''), 6000)
      await load()
      await carregarSaldo()
    } catch (e: any) {
      setErroEncerramento(e?.message || 'Erro de rede.')
    } finally {
      setEnviandoEncerramento(false)
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
  // Total recebido = NFs que reservam saldo (exclui cancelada / rejeitada legada).
  const totalNF = (sol.notas_fiscais || [])
    .filter(n => n.status !== 'rejeitada' && n.status !== 'cancelada')
    .reduce((s, n) => s + n.valor, 0)

  return (
    <div className="flex flex-col min-h-screen bg-[var(--background)]">
      <Topbar
        title={`FIP-${String(sol.numero).padStart(4, '0')}`}
        actions={
          <Link href={`/contratos/${id}/fat-direto/nova`}>
            <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-500 text-white">
              <Plus className="w-4 h-4" /> Nova Solicitação
            </Button>
          </Link>
        }
      />
      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/contratos/${id}/fat-direto`}>
              <Button variant="ghost" size="sm" className="text-[var(--text-3)] hover:text-[var(--text-1)] gap-2">
                <ArrowLeft className="w-4 h-4" /> Faturamento Direto
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold" style={{ color: 'var(--text-1)' }}>FIP-{String(sol.numero).padStart(4, '0')}</h1>
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
                    onClick={() => setShowApprovalDialog(true)}
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
                  <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}/editar`}>
                    <Button variant="ghost" className="gap-2 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10">
                      <FileText className="w-4 h-4" /> Editar
                    </Button>
                  </Link>
                  {isAdmin && (
                    <Button
                      onClick={cancelarPedido}
                      disabled={acting}
                      variant="ghost"
                      className={confirmCancelar
                        ? 'gap-2 bg-amber-600 hover:bg-amber-700 text-white'
                        : 'gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}
                      title="Marca o pedido como cancelado (não apaga — pode ser reaberto depois)."
                    >
                      <Ban className="w-4 h-4" />
                      {confirmCancelar ? 'Confirmar Cancelamento' : 'Cancelar pedido'}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      onClick={deletar}
                      disabled={acting}
                      variant="ghost"
                      className={confirmDelete
                        ? 'gap-2 bg-red-600 hover:bg-red-700 text-white'
                        : 'gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10'}
                    >
                      <Trash2 className="w-4 h-4" />
                      {confirmDelete ? 'Confirmar Exclusão' : 'Excluir'}
                    </Button>
                  )}
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

        {/* Enviar pra análise (rascunho / rejeitado / cancelado) */}
        {(sol.status === 'rascunho' || sol.status === 'rejeitado' || sol.status === 'cancelado') && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.30)' }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-sm text-amber-400 font-semibold mb-1">
                    {sol.status === 'rascunho'  && 'Solicitação em rascunho'}
                    {sol.status === 'rejeitado' && 'Solicitação rejeitada'}
                    {sol.status === 'cancelado' && 'Solicitação cancelada'}
                  </p>
                  <p className="text-xs text-[var(--text-3)]">
                    {sol.status === 'rascunho' &&
                      'Envie para análise pra iniciar o fluxo de aprovação da Gestão WAVE.'}
                    {sol.status === 'rejeitado' &&
                      'Corrija os dados se necessário (botão Editar) e reenvie para análise.'}
                    {sol.status === 'cancelado' &&
                      'Reabra o fluxo enviando novamente para análise.'}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Link href={`/contratos/${sol.contrato_id}/fat-direto/${sol.id}/editar`}>
                    <Button variant="ghost" className="gap-2 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 whitespace-nowrap">
                      <FileText className="w-4 h-4" /> Editar
                    </Button>
                  </Link>
                  <Button
                    onClick={() => acao('aguardando_aprovacao')}
                    disabled={acting}
                    className="gap-2 bg-amber-600 hover:bg-amber-500 text-white whitespace-nowrap"
                  >
                    <PlayCircle className="w-4 h-4" />
                    {acting ? 'Enviando...' : 'Enviar para análise'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Notificar envolvidos (pedido aprovado) */}
        {sol.status === 'aprovado' && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(59,130,246,0.25)' }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-blue-400 font-semibold mb-1">Notificar envolvidos do projeto</p>
                  <p className="text-xs text-[var(--text-3)]">
                    Envia a autorização por email pros envolvidos selecionados (usuários atrelados à obra).
                    Você escolhe quem recebe e visualiza o preview antes de enviar.
                  </p>
                  {emailSucesso && (
                    <p className="text-xs text-emerald-400 mt-2">{emailSucesso}</p>
                  )}
                </div>
                <Button
                  onClick={() => { setEmailModalMode('reenviar'); setShowEmailModal(true) }}
                  variant="ghost"
                  className="gap-2 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  Enviar notificação aos envolvidos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Solicitar encerramento de saldo — disponível pra qualquer usuário (Wave/fornecedor),
            sem privilégio admin. Só aparece quando há saldo > R$ 0,01 ainda não encerrado. */}
        {sol.status === 'aprovado' && saldo && saldo.saldo_liquido > 0.01 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(245,158,11,0.30)' }}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-amber-400 font-semibold mb-1">
                    Solicitar encerramento de saldo
                  </p>
                  <p className="text-xs text-[var(--text-3)]">
                    Quando o fornecedor confirmar que não emitirá mais NF para este pedido, peça o
                    cancelamento do saldo de <strong className="text-amber-400">{formatCurrency(saldo.saldo_liquido)}</strong>.
                    O aprovador receberá a solicitação e poderá aprovar ou rejeitar.
                  </p>
                  {encerramentoSucesso && (
                    <p className="text-xs text-emerald-400 mt-2">{encerramentoSucesso}</p>
                  )}
                </div>
                <Button
                  onClick={abrirSolicitarEncerramento}
                  disabled={acting || enviandoEncerramento}
                  variant="ghost"
                  className="gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 whitespace-nowrap"
                >
                  <Ban className="w-4 h-4" />
                  Solicitar encerramento de saldo
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin actions for approved/rejected */}
        {isAdmin && sol.status !== 'aguardando_aprovacao' && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-red-400 font-semibold mb-3">Ações de Administrador</p>
              <div className="flex gap-3 flex-wrap">
                {sol.status === 'aprovado' && (
                  <Button
                    onClick={() => acao('aguardando_aprovacao')}
                    disabled={acting}
                    variant="ghost"
                    className="gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    <XCircle className="w-4 h-4" /> Desaprovar
                  </Button>
                )}
                {sol.status === 'aprovado' && (
                  <Button
                    onClick={() => setShowEncerrarModal(true)}
                    disabled={acting}
                    variant="ghost"
                    className="gap-2 border border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                    title="Encerra o pedido e devolve o saldo (não recebido em NF) aos itens originais. Irreversível."
                  >
                    <RotateCcw className="w-4 h-4" /> Encerrar e devolver saldo
                  </Button>
                )}
                {sol.status !== 'cancelado' && sol.status !== 'encerrado' && (
                  <Button
                    onClick={cancelarPedido}
                    disabled={acting}
                    variant="ghost"
                    className={confirmCancelar
                      ? 'gap-2 bg-amber-600 hover:bg-amber-700 text-white'
                      : 'gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10'}
                    title="Marca o pedido como cancelado (não apaga — pode ser reaberto depois)."
                  >
                    <Ban className="w-4 h-4" />
                    {confirmCancelar ? 'Confirmar Cancelamento' : 'Cancelar pedido'}
                  </Button>
                )}
                <Button
                  onClick={deletar}
                  disabled={acting}
                  variant="ghost"
                  className={confirmDelete
                    ? 'gap-2 bg-red-600 hover:bg-red-700 text-white'
                    : 'gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10'}
                >
                  <Trash2 className="w-4 h-4" />
                  {confirmDelete ? 'Confirmar Exclusão' : 'Excluir'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Observações — exibe por extenso (whitespace-pre-wrap) pra ler todo o conteúdo */}
        {sol.observacoes && sol.observacoes.trim().length > 0 && (
          <Card style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <FileText className="w-4 h-4" style={{ color: 'var(--text-3)' }} />
                Observações do pedido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words"
                style={{
                  color: 'var(--text-2)',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  padding: '12px 14px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                }}
              >
                {sol.observacoes}
              </div>
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
              {saldo && saldo.alerta !== 'ok' && (
                <p
                  className="text-xs mt-0.5 font-semibold"
                  style={{ color: saldo.alerta === 'atencao' ? '#F59E0B' : '#EF4444' }}
                >
                  {saldo.pct_utilizado.toFixed(1)}% do pedido utilizado · saldo {formatCurrency(saldo.saldo_liquido)}
                </p>
              )}
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

                {/* P2.9: Indicador de saldo + alerta >95% */}
                {saldo && (() => {
                  const palette = {
                    ok:       { bg: 'rgba(16,185,129,0.10)',  border: '#10B981', text: '#10B981', icon: '✓' },
                    atencao:  { bg: 'rgba(245,158,11,0.10)',  border: '#F59E0B', text: '#F59E0B', icon: '⚠' },
                    critico:  { bg: 'rgba(239,68,68,0.12)',   border: '#EF4444', text: '#EF4444', icon: '⚠' },
                    esgotado: { bg: 'rgba(239,68,68,0.22)',   border: '#EF4444', text: '#EF4444', icon: '✕' },
                  }[saldo.alerta]
                  const pct = Math.min(100, Math.max(0, saldo.pct_utilizado))
                  const labelAlerta = {
                    ok:       `Saldo OK — ${pct.toFixed(1)}% do pedido utilizado.`,
                    atencao:  `Atenção: ${pct.toFixed(1)}% do pedido já utilizado. Saldo: ${formatCurrency(saldo.saldo_liquido)}.`,
                    critico:  `ALERTA — ${pct.toFixed(1)}% do pedido utilizado. Saldo restante: ${formatCurrency(saldo.saldo_liquido)}.`,
                    esgotado: `Pedido esgotado (100% utilizado). Novas NFs serão bloqueadas.`,
                  }[saldo.alerta]
                  return (
                    <div
                      className="rounded-lg px-3 py-2 space-y-2"
                      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
                    >
                      <div className="flex items-center justify-between text-xs" style={{ color: palette.text }}>
                        <span className="font-semibold">{palette.icon} {labelAlerta}</span>
                        <span className="tabular-nums">
                          {formatCurrency(saldo.total_nf_validadas + saldo.total_nf_pendentes)} / {formatCurrency(saldo.pedido_valor)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-1)' }}>
                        <div
                          className="h-full transition-all"
                          style={{ width: `${pct}%`, background: palette.border }}
                        />
                      </div>
                    </div>
                  )
                })()}

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
                  <Button
                    onClick={registrarNF}
                    disabled={acting || saldo?.alerta === 'esgotado'}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
                  >
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
                {(sol.notas_fiscais || []).map(nf => {
                  const badge = nfStatusBadge(nf.status)
                  const emCorrecao = nf.status === 'em_correcao'
                  const corrigindo = corrigindoNfId === nf.id
                  return (
                    <div key={nf.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: 'var(--text-1)' }}>NF {nf.numero_nf}</p>
                          <p className="text-xs text-[var(--text-3)] truncate">
                            {nf.emitente || '—'} · {formatDate(nf.data_emissao)}
                          </p>
                          {nf.arquivo_url && (
                            <a
                              href={nf.arquivo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-400 hover:text-blue-300 inline-flex items-center gap-1 mt-0.5"
                            >
                              <FileText className="w-3 h-3" /> Ver arquivo
                            </a>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(nf.valor)}</p>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full inline-block mt-0.5"
                            style={{ background: badge.bg, color: badge.color }}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>

                      {/* NF rejeitada — motivo + ação de correção */}
                      {emCorrecao && (
                        <div className="mt-2">
                          {nf.motivo_rejeicao && (
                            <div
                              className="rounded-lg px-3 py-2 text-xs"
                              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}
                            >
                              <span className="font-bold uppercase tracking-wide">Motivo da rejeição: </span>
                              {nf.motivo_rejeicao}
                            </div>
                          )}
                          {!corrigindo && (
                            <Button
                              onClick={() => abrirCorrecao(nf)}
                              size="sm"
                              variant="ghost"
                              className="mt-2 gap-1 text-amber-400 hover:text-amber-300"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Corrigir e reenviar
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Formulário de correção pré-preenchido */}
                      {corrigindo && (
                        <div
                          className="mt-3 p-4 rounded-xl space-y-3"
                          style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                        >
                          <p className="text-xs text-[var(--text-3)] font-semibold uppercase tracking-wide">
                            Corrigir NF {nf.numero_nf}
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {([
                              { label: 'Número NF', key: 'numero_nf', type: 'text' },
                              { label: 'Emitente', key: 'emitente', type: 'text' },
                              { label: 'CNPJ Emitente', key: 'cnpj_emitente', type: 'text' },
                              { label: 'Valor (R$)', key: 'valor', type: 'number' },
                              { label: 'Data Emissão', key: 'data_emissao', type: 'date' },
                              { label: 'Data Recebimento', key: 'data_recebimento', type: 'date' },
                              { label: 'Data Vencimento', key: 'data_vencimento', type: 'date' },
                              { label: 'Descrição', key: 'descricao', type: 'text' },
                            ] as const).map(f => (
                              <div key={f.key}>
                                <label className="block text-xs text-[var(--text-3)] mb-1">{f.label}</label>
                                <input
                                  type={f.type}
                                  value={(corrForm as any)[f.key]}
                                  onChange={e => setCorrForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                                  style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                                />
                              </div>
                            ))}
                          </div>
                          {corrErro && (
                            <div
                              className="p-2.5 rounded-lg text-xs"
                              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}
                            >
                              {corrErro}
                            </div>
                          )}
                          <div className="flex gap-2 pt-1">
                            <Button
                              onClick={() => reenviarNf(nf.id)}
                              disabled={acting}
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
                            >
                              {acting ? 'Reenviando...' : 'Reenviar para aprovação'}
                            </Button>
                            <Button
                              onClick={() => { setCorrigindoNfId(null); setCorrErro('') }}
                              size="sm"
                              variant="ghost"
                              className="text-[var(--text-3)]"
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de aprovação — escolhe aprovar com ou sem notificação */}
      {showApprovalDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => !acting && setShowApprovalDialog(false)}
        >
          <div
            className="w-full max-w-md rounded-xl overflow-hidden"
            style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>
                Aprovar FIP-{String(sol.numero).padStart(4, '0')}?
              </h3>
            </div>

            <div className="p-5 space-y-3 text-sm" style={{ color: 'var(--text-2)' }}>
              <p>Escolha como quer aprovar:</p>
              <div className="text-xs p-3 rounded-lg" style={{ background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
                <strong style={{ color: 'var(--text-2)' }}>Aprovar e notificar envolvidos:</strong> abre uma tela pra você selecionar quais usuários atrelados à obra vão receber o email, com preview do conteúdo antes de enviar.
                <br /><br />
                <strong style={{ color: 'var(--text-2)' }}>Só aprovar:</strong> marca como aprovado sem enviar email.
              </div>
            </div>

            <div className="px-5 py-3 border-t flex flex-col sm:flex-row justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
              <Button
                onClick={() => setShowApprovalDialog(false)}
                disabled={acting}
                variant="ghost"
                className="text-[var(--text-3)]"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => acao('aprovado')}
                disabled={acting}
                variant="ghost"
                className="gap-2 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                <CheckCircle className="w-4 h-4" />
                {acting ? 'Aprovando...' : 'Só aprovar'}
              </Button>
              <Button
                onClick={async () => {
                  // Primeiro aprova (sem email), depois abre modal de notificação
                  await acao('aprovado')
                  setEmailModalMode('aprovar')
                  setShowEmailModal(true)
                }}
                disabled={acting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Mail className="w-4 h-4" />
                Aprovar e notificar envolvidos
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de notificação aos envolvidos — checkbox + preview + enviar */}
      <EmailEnvolvidosModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        contratoId={id}
        solicitacaoId={solId}
        reenvio={emailModalMode === 'reenviar'}
        modo={emailModalMode}
        onSent={qtd => {
          setEmailSucesso(`Notificação enviada para ${qtd} envolvido${qtd > 1 ? 's' : ''}.`)
          load()
        }}
      />

      <EncerrarPedidoModal
        open={showEncerrarModal}
        onClose={() => setShowEncerrarModal(false)}
        contratoId={id}
        solId={solId}
        numeroPedidoFip={(sol as any)?.numero_pedido_fip ?? sol.numero}
        valorTotalPedido={Number(sol.valor_total || 0)}
        totalNfsRecebidas={(sol.notas_fiscais || [])
          .filter(nf => nf.status !== 'rejeitada' && nf.status !== 'cancelada')
          .reduce((s, nf) => s + Number(nf.valor || 0), 0)}
        itens={(sol.itens || []).map(it => ({
          id: it.id,
          descricao: it.descricao,
          valor_unitario: Number(it.valor_unitario || 0),
          valor_devolvido: Number(it.valor_devolvido || 0),
          codigo: it.tarefa?.codigo ?? null,
        }))}
        envolvidos={envolvidosContrato}
        onSuccess={() => { load(); carregarSaldo() }}
      />

      {/* Modal — Solicitar encerramento de saldo (fluxo do solicitante) */}
      <Dialog
        open={showSolicitarEncerramento}
        onOpenChange={(open) => {
          if (!open && !enviandoEncerramento) {
            setShowSolicitarEncerramento(false)
            setErroEncerramento('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-amber-400 flex items-center gap-2">
              <Ban className="w-5 h-5" />
              Solicitar encerramento de saldo do pedido FIP-{String(sol.numero).padStart(4, '0')}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-2)]">
              Você está pedindo cancelamento do saldo de{' '}
              <strong className="text-amber-400">
                {formatCurrency(saldo?.saldo_liquido ?? 0)}
              </strong>{' '}
              que ainda não virou NF. O aprovador será notificado e poderá aprovar ou rejeitar.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-[var(--text-3)] font-medium uppercase tracking-wider">
                Motivo *
              </Label>
              <Textarea
                value={motivoEncerramento}
                onChange={e => setMotivoEncerramento(e.target.value)}
                placeholder="Justificativa para o encerramento do saldo..."
                className="min-h-[100px] bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
              />
            </div>
            {erroEncerramento && (
              <p className="text-xs text-red-400">{erroEncerramento}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSolicitarEncerramento(false)}
              disabled={enviandoEncerramento}
            >
              Cancelar
            </Button>
            <Button
              variant="warning"
              onClick={confirmarSolicitacaoEncerramento}
              loading={enviandoEncerramento}
              disabled={!motivoEncerramento.trim()}
            >
              <Ban className="w-4 h-4" />
              Confirmar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
