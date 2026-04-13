'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { MaximizableCard } from '@/components/ui/maximizable-card'
import { PdfPreviewModal } from '@/components/pdf-preview-modal'
import { ColumnFilter, passaFiltro } from '@/components/ui/column-filter'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { formatCurrency } from '@/lib/utils'
import {
  FileText, Search, Filter, Download, Clock, CheckCircle2, Banknote,
  X, Upload, RefreshCw, FolderOpen, Receipt,
  Paperclip, FileCheck, Trash2, Loader2, Undo2,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Contrato { id: string; numero: string; descricao: string }
interface PerfilMini { id: string; nome: string | null; email: string | null }
interface Pedido {
  id: string
  numero: number
  status: string
  data_solicitacao: string
  data_aprovacao: string | null
  valor_total: number
  fornecedor_razao_social: string
  fornecedor_cnpj: string
  numero_pedido_fip: number | null
  pedido_pdf_url: string | null
  pedido_pdf_nome: string | null
  nf_numero: string | null
  nf_data: string | null
  nf_pdf_url: string | null
  status_documento: string
  contrato: Contrato | null
  solicitante: PerfilMini | null
  aprovador:   PerfilMini | null
}

// Preferimos o nome do perfil; se faltar, cai para o prefixo do e-mail
function nomeExibicao(p: PerfilMini | null | undefined): string {
  if (!p) return '—'
  if (p.nome && p.nome.trim()) return p.nome.trim()
  if (p.email) return p.email.split('@')[0]
  return '—'
}

// ── Status config ──────────────────────────────────────────────────────────
const STATUS_DOC: Record<string, { label: string; color: string; bg: string; Icon: any }> = {
  pendente_nf: { label: 'Pendente NF',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  Icon: Clock },
  nf_recebida: { label: 'NF Recebida',  color: '#3B82F6', bg: 'rgba(59,130,246,0.12)',  Icon: CheckCircle2 },
  pago:        { label: 'Pago',         color: '#10B981', bg: 'rgba(16,185,129,0.12)',  Icon: Banknote },
}

function formatDateBR(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso + (iso.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR')
}

function formatCnpj(v: string | null) {
  if (!v) return '—'
  const d = v.replace(/\D/g, '')
  if (d.length !== 14) return v
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12,14)}`
}

// ── Componente badge de status ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_DOC[status] ?? STATUS_DOC.pendente_nf
  const { Icon } = cfg
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: cfg.bg, color: cfg.color }}>
      <Icon className="w-3 h-3" strokeWidth={2} />
      {cfg.label}
    </span>
  )
}

// ── Ícone PDF clicável ─────────────────────────────────────────────────────
function PdfIcon({ url, nome, onClick }: { url: string | null; nome: string | null; onClick: () => void }) {
  if (!url) return <span style={{ color: 'var(--text-3)' }}>—</span>
  return (
    <button
      onClick={onClick}
      title={nome ?? 'Ver PDF'}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all"
      style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.20)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)' }}
    >
      <FileText className="w-4 h-4" strokeWidth={1.5} />
    </button>
  )
}

// ── Modal Anexar NF ────────────────────────────────────────────────────────
function AnexarNfModal({
  pedido,
  onClose,
  onSaved,
}: {
  pedido: Pedido
  onClose: () => void
  onSaved: (updated: Pedido) => void
}) {
  const [nfNumero, setNfNumero] = useState(pedido.nf_numero ?? '')
  const [nfData, setNfData] = useState(pedido.nf_data ?? '')
  const [nfFile, setNfFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleSave() {
    if (!nfNumero.trim()) { setErro('Informe o número da NF'); return }
    setSaving(true)
    setErro('')
    try {
      if (nfFile) {
        // Upload NF PDF
        const fd = new FormData()
        fd.append('file', nfFile)
        fd.append('solicitacao_id', pedido.id)
        fd.append('tipo', 'nf')
        fd.append('nf_numero', nfNumero)
        if (nfData) fd.append('nf_data', nfData)
        const res = await fetch('/api/fat-direto/upload', { method: 'POST', body: fd })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      } else {
        // Só atualiza metadados
        const res = await fetch(`/api/fat-direto/documentos/${pedido.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nf_numero: nfNumero,
            ...(nfData ? { nf_data: nfData } : {}),
            status_documento: 'nf_recebida',
          }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      }

      // Recarregar dados do pedido
      const res = await fetch(`/api/fat-direto/documentos/${pedido.id}`)
      if (res.ok) {
        const updated = await res.json()
        onSaved(updated)
      } else {
        onSaved({ ...pedido, nf_numero: nfNumero, nf_data: nfData || null, status_documento: 'nf_recebida' })
      }
      onClose()
    } catch (e: any) {
      setErro(e.message)
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all'
  const inputStyle = { background: 'var(--surface-3)', border: '1px solid var(--border)', color: 'var(--text-1)' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
            <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>
              <Receipt className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
            </span>
            Anexar Nota Fiscal
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-3)' }}><X className="w-4 h-4" strokeWidth={1.5} /></button>
        </div>

        <div className="text-xs p-2 rounded-lg" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>
          Pedido FIP-{String(pedido.numero_pedido_fip ?? pedido.numero).padStart(4, '0')} · {pedido.fornecedor_razao_social}
        </div>

        {erro && (
          <div className="text-xs p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.10)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.30)' }}>{erro}</div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Nº da Nota Fiscal *</label>
            <input type="text" value={nfNumero} onChange={e => setNfNumero(e.target.value)}
              placeholder="Ex: 12345" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Data de Emissão</label>
            <input type="date" value={nfData} onChange={e => setNfData(e.target.value)}
              className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>PDF da Nota Fiscal (opcional)</label>
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition-all"
              style={{ background: 'var(--surface-3)', border: `1px dashed ${nfFile ? 'var(--accent)' : 'var(--border)'}` }}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: nfFile ? 'var(--accent)' : 'var(--text-3)' }} />
              <span className="text-sm truncate" style={{ color: nfFile ? 'var(--text-1)' : 'var(--text-3)' }}>
                {nfFile ? nfFile.name : 'Clique para selecionar o PDF...'}
              </span>
              {nfFile && (
                <button onClick={e => { e.stopPropagation(); setNfFile(null) }} style={{ color: 'var(--text-3)' }}>
                  <X className="w-3.5 h-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
              onChange={e => setNfFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} style={{ color: 'var(--text-3)' }} className="flex-1">Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
          >
            {saving ? (
              <><RefreshCw className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} /> Salvando...</>
            ) : (
              <><FileCheck className="w-3.5 h-3.5" strokeWidth={1.5} /> Salvar NF</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Configuração por view (query param ?view=) ───────────────────────────
const VIEW_CONFIG: Record<string, { title: string; subtitle: string; icon: any; gradient: string }> = {
  'com-nf': {
    title: 'NFs Lançadas — Faturamento Direto',
    subtitle: 'Pedidos que já possuem nota fiscal anexada',
    icon: Receipt,
    gradient: 'linear-gradient(135deg, #3B82F6, #6366F1)',
  },
  'aprovadas': {
    title: 'Solicitações Aprovadas — Faturamento Direto',
    subtitle: 'Todos os pedidos aprovados, com ou sem NF',
    icon: CheckCircle2,
    gradient: 'linear-gradient(135deg, #F59E0B, #EAB308)',
  },
  '': {
    title: 'Pedidos Aprovados — Faturamento Direto',
    subtitle: 'Gerencie PDFs de pedidos, vincule notas fiscais e acompanhe pagamentos',
    icon: FolderOpen,
    gradient: 'linear-gradient(135deg, #EF4444, #F97316)',
  },
}

// ── Wrapper com Suspense ──────────────────────────────────────────────────
// useSearchParams() precisa estar dentro de um Suspense boundary para
// que o Next.js consiga pre-renderizar a página sem fazer bailout de CSR.
export default function PedidosFatDiretoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-24" style={{ color: 'var(--text-3)' }}>
        <RefreshCw className="w-5 h-5 animate-spin mr-2" strokeWidth={1.5} />
        <span className="text-sm">Carregando...</span>
      </div>
    }>
      <PedidosFatDiretoContent />
    </Suspense>
  )
}

// ── Conteúdo real da página ───────────────────────────────────────────────
function PedidosFatDiretoContent() {
  const searchParams = useSearchParams()
  const view = (searchParams?.get('view') ?? '') as 'com-nf' | 'aprovadas' | ''
  const viewCfg = VIEW_CONFIG[view] ?? VIEW_CONFIG['']

  const { perfilAtual, temPermissao } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'
  const podeDesaprovar = isAdmin || temPermissao('aprovacoes', 'aprovar')

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros simples (busca NF e intervalo de datas)
  // Para as views vindas do Dashboard (aprovadas e com-nf), o default é
  // 01/01/2026 → hoje — garante janela clara já no load. A view padrão
  // (sem query param) começa sem filtro de data.
  const hojeISO = new Date().toISOString().slice(0, 10)
  const temDefaultData = view === 'aprovadas' || view === 'com-nf'
  const [dataInicio, setDataInicio] = useState(temDefaultData ? '2026-01-01' : '')
  const [dataFim, setDataFim]       = useState(temDefaultData ? hojeISO      : '')
  const [nfBusca, setNfBusca] = useState('')

  // Filtros tipo Excel — um Set<string> por coluna (vazio = tudo selecionado)
  const [filtroPedido,      setFiltroPedido]      = useState<Set<string>>(new Set())
  const [filtroFornecedor,  setFiltroFornecedor]  = useState<Set<string>>(new Set())
  const [filtroSolicitante, setFiltroSolicitante] = useState<Set<string>>(new Set())
  const [filtroAprovador,   setFiltroAprovador]   = useState<Set<string>>(new Set())
  const [filtroStatus,      setFiltroStatus]      = useState<Set<string>>(new Set())

  // Modais
  const [pdfModal, setPdfModal] = useState<{ url: string; nome: string } | null>(null)
  const [anexarNfPedido, setAnexarNfPedido] = useState<Pedido | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [desaprovandoId, setDesaprovandoId] = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (dataInicio) params.set('data_inicio', dataInicio)
    if (dataFim) params.set('data_fim', dataFim)
    if (nfBusca) params.set('nf_numero', nfBusca)

    const res = await fetch(`/api/fat-direto/documentos?${params}`)
    if (res.ok) setPedidos(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function limparFiltros() {
    setDataInicio(''); setDataFim(''); setNfBusca('')
    setFiltroPedido(new Set())
    setFiltroFornecedor(new Set())
    setFiltroSolicitante(new Set())
    setFiltroAprovador(new Set())
    setFiltroStatus(new Set())
  }

  async function excluirPedido(pedido: Pedido) {
    const fip = pedido.numero_pedido_fip ? `FIP-${String(pedido.numero_pedido_fip).padStart(4,'0')}` : `#${pedido.numero}`
    if (!confirm(`Excluir o pedido ${fip} de ${pedido.fornecedor_razao_social}?\n\nEsta é uma exclusão lógica (soft-delete) — o registro continua no banco para auditoria, mas some das listagens.`)) return
    setExcluindoId(pedido.id)
    try {
      const res = await fetch(`/api/fat-direto/documentos/${pedido.id}`, { method: 'DELETE' })
      if (res.ok) {
        setPedidos(prev => prev.filter(p => p.id !== pedido.id))
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Não foi possível excluir o pedido.')
      }
    } finally {
      setExcluindoId(null)
    }
  }

  async function desaprovarPedido(pedido: Pedido) {
    const fip = pedido.numero_pedido_fip ? `FIP-${String(pedido.numero_pedido_fip).padStart(4,'0')}` : `#${pedido.numero}`
    const motivo = prompt(
      `Desaprovar o pedido ${fip} de ${pedido.fornecedor_razao_social}?\n\n` +
      `Ele voltará ao status "Rascunho" e só o solicitante original (ou admin) poderá editar/excluir.\n\n` +
      `Informe o MOTIVO da desaprovação:`
    )
    if (motivo === null) return            // cancelado
    if (!motivo.trim()) {
      alert('O motivo é obrigatório.')
      return
    }
    setDesaprovandoId(pedido.id)
    try {
      const res = await fetch(`/api/fat-direto/solicitacoes/${pedido.id}/desaprovar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      if (res.ok) {
        // Remove da listagem atual (volta pra rascunho, some de aprovadas)
        setPedidos(prev => prev.filter(p => p.id !== pedido.id))
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Não foi possível desaprovar o pedido.')
      }
    } finally {
      setDesaprovandoId(null)
    }
  }

  async function marcarPago(pedido: Pedido) {
    const res = await fetch(`/api/fat-direto/documentos/${pedido.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status_documento: 'pago' }),
    })
    if (res.ok) {
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status_documento: 'pago' } : p))
    }
  }

  function onNfSaved(updated: Pedido) {
    setPedidos(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
  }

  // Exportar CSV (respeita os filtros de coluna aplicados na UI)
  function exportCsv() {
    const cols = ['Pedido', 'Fornecedor', 'CNPJ', 'Solicitante', 'Data Solicit.', 'Aprovador', 'Data Aprov.', 'Valor Total', 'Nº NF', 'Data NF', 'Status']
    const rows = pedidosFiltrados.map(p => [
      p.numero_pedido_fip ? `FIP-${String(p.numero_pedido_fip).padStart(4,'0')}` : p.numero,
      p.fornecedor_razao_social,
      formatCnpj(p.fornecedor_cnpj),
      nomeExibicao(p.solicitante),
      formatDateBR(p.data_solicitacao),
      nomeExibicao(p.aprovador),
      p.data_aprovacao ? formatDateBR(p.data_aprovacao) : '',
      p.valor_total,
      p.nf_numero ?? '',
      p.nf_data ? formatDateBR(p.nf_data) : '',
      STATUS_DOC[p.status_documento]?.label ?? p.status_documento,
    ])
    const csv = [cols, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pedidos-faturamento-direto-${view || 'todos'}-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  // Valores únicos por coluna (para popular os filtros estilo Excel)
  const valoresUnicos = useMemo(() => {
    return {
      pedido:      pedidos.map(p => p.numero_pedido_fip ? `FIP-${String(p.numero_pedido_fip).padStart(4,'0')}` : `#${p.numero}`),
      fornecedor:  pedidos.map(p => p.fornecedor_razao_social || '—'),
      solicitante: pedidos.map(p => nomeExibicao(p.solicitante)),
      aprovador:   pedidos.map(p => nomeExibicao(p.aprovador)),
      status:      pedidos.map(p => STATUS_DOC[p.status_documento]?.label ?? p.status_documento),
    }
  }, [pedidos])

  // Lista final aplicando os filtros estilo Excel no client
  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      const pedidoStr      = p.numero_pedido_fip ? `FIP-${String(p.numero_pedido_fip).padStart(4,'0')}` : `#${p.numero}`
      const statusStr      = STATUS_DOC[p.status_documento]?.label ?? p.status_documento
      if (!passaFiltro(filtroPedido,      pedidoStr))                         return false
      if (!passaFiltro(filtroFornecedor,  p.fornecedor_razao_social || '—'))  return false
      if (!passaFiltro(filtroSolicitante, nomeExibicao(p.solicitante)))       return false
      if (!passaFiltro(filtroAprovador,   nomeExibicao(p.aprovador)))         return false
      if (!passaFiltro(filtroStatus,      statusStr))                         return false
      return true
    })
  }, [pedidos, filtroPedido, filtroFornecedor, filtroSolicitante, filtroAprovador, filtroStatus])

  const totalFiltrado = pedidosFiltrados.reduce((s, p) => s + (p.valor_total || 0), 0)
  const temFiltroAtivo = !!(
    dataInicio || dataFim || nfBusca ||
    filtroPedido.size || filtroFornecedor.size || filtroSolicitante.size ||
    filtroAprovador.size || filtroStatus.size
  )

  const inputCls = 'rounded-xl px-3 py-2 text-sm outline-none transition-all'
  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }

  const ViewIcon = viewCfg.icon

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title={viewCfg.title} />

      <div className="flex-1 p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <span className="apple-icon" style={{ background: viewCfg.gradient }}>
                <ViewIcon className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </span>
              {viewCfg.title}
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              {viewCfg.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={carregar} size="sm" className="gap-1.5" style={{ color: 'var(--text-3)' }}>
              <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Atualizar
            </Button>
            <Button onClick={exportCsv} size="sm" variant="ghost" className="gap-1.5" style={{ color: 'var(--text-3)' }}>
              <Download className="w-3.5 h-3.5" strokeWidth={1.5} /> Exportar CSV
            </Button>
          </div>
        </div>

        {/* Filtros globais (data + busca NF). Os filtros por coluna estão no cabeçalho da tabela. */}
        <MaximizableCard title="Filtros rápidos" className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Filtros rápidos</span>
            <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>
              · Para filtrar pedido / fornecedor / solicitante / aprovador / status use o ícone 🔽 no cabeçalho de cada coluna
            </span>
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                <X className="w-3 h-3" strokeWidth={2} /> Limpar tudo
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {/* Período — em views de aprovadas/com-nf filtramos pela data de
                 aprovação (faz mais sentido pro histórico de NF); na view
                 padrão o filtro é sobre a data da solicitação. */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                {temDefaultData ? 'Data aprovação início' : 'Data início'}
              </label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>
                {temDefaultData ? 'Data aprovação fim' : 'Data fim'}
              </label>
              <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>

            {/* Busca NF */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Nº Nota Fiscal</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
                <input type="text" value={nfBusca} onChange={e => setNfBusca(e.target.value)}
                  placeholder="Buscar NF..." className={`${inputCls} pl-8 w-full`} style={inputStyle} />
              </div>
            </div>

            <div className="flex items-end">
              <Button
                onClick={carregar}
                size="sm"
                className="gap-1.5 text-white w-full"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
              >
                <Search className="w-3.5 h-3.5" strokeWidth={1.5} /> Buscar
              </Button>
            </div>
          </div>
        </MaximizableCard>

        {/* Tabela */}
        <MaximizableCard title="Documentos de Faturamento Direto" className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Grid template: Pedido | Fornecedor | Solicitante | Data Sol. | Aprovador | Data Apr. | Valor | Status | Pedido PDF | NF PDF | (Ações) */}
          {(() => {
            // A coluna de ações aparece se:
            //  - Admin (pode excluir) OU
            //  - Usuário com permissão de aprovação (pode desaprovar)
            const mostrarAcoes = isAdmin || podeDesaprovar
            // Largura da coluna ações: 40px se só 1 botão, 80px se 2
            const larguraAcoes = (isAdmin && podeDesaprovar) ? '80px' : '40px'
            const gridCols = mostrarAcoes
              ? `110px 1.6fr 1fr 90px 1fr 90px 110px 130px 72px 72px ${larguraAcoes}`
              : '110px 1.6fr 1fr 90px 1fr 90px 110px 130px 72px 72px'
            return (
              <>
                {/* Header da tabela com filtros estilo Excel — sticky pra ficar visível no scroll */}
                <div
                  className="grid text-[11px] font-semibold uppercase tracking-wide px-4 py-2.5 sticky top-0 z-10"
                  style={{
                    gridTemplateColumns: gridCols,
                    gap: '8px',
                    background: 'var(--surface-3)',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-3)',
                  }}
                >
                  <span className="flex items-center gap-1">
                    Pedido
                    <ColumnFilter label="Pedido" values={valoresUnicos.pedido} selected={filtroPedido} onChange={setFiltroPedido} />
                  </span>
                  <span className="flex items-center gap-1">
                    Fornecedor
                    <ColumnFilter label="Fornecedor" values={valoresUnicos.fornecedor} selected={filtroFornecedor} onChange={setFiltroFornecedor} />
                  </span>
                  <span className="flex items-center gap-1">
                    Solicitante
                    <ColumnFilter label="Solicitante" values={valoresUnicos.solicitante} selected={filtroSolicitante} onChange={setFiltroSolicitante} />
                  </span>
                  <span>Data solicit.</span>
                  <span className="flex items-center gap-1">
                    Aprovador
                    <ColumnFilter label="Aprovador" values={valoresUnicos.aprovador} selected={filtroAprovador} onChange={setFiltroAprovador} />
                  </span>
                  <span>Data aprov.</span>
                  <span className="text-right">Valor</span>
                  <span className="flex items-center gap-1">
                    Status
                    <ColumnFilter label="Status" values={valoresUnicos.status} selected={filtroStatus} onChange={setFiltroStatus} />
                  </span>
                  <span className="text-center">Pedido PDF</span>
                  <span className="text-center">NF PDF</span>
                  {mostrarAcoes && <span className="text-center" title="Ações">·</span>}
                </div>

                {/* Linhas */}
                {loading ? (
                  <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--text-3)' }}>
                    <RefreshCw className="w-5 h-5 animate-spin" strokeWidth={1.5} />
                    <span className="text-sm">Carregando...</span>
                  </div>
                ) : pedidosFiltrados.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-3)' }}>
                    <FolderOpen className="w-10 h-10 opacity-30" strokeWidth={1} />
                    <div className="text-center max-w-md">
                      <p className="text-sm font-medium">Nenhum pedido encontrado</p>
                      {(dataInicio || dataFim) ? (
                        <>
                          <p className="text-xs mt-0.5">
                            Nenhuma solicitação entre <strong>{dataInicio ? formatDateBR(dataInicio) : '—'}</strong> e <strong>{dataFim ? formatDateBR(dataFim) : 'hoje'}</strong>.
                          </p>
                          <button
                            onClick={() => { setDataInicio(''); setDataFim(''); setTimeout(carregar, 0) }}
                            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all"
                            style={{
                              background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))',
                              color: '#FFFFFF',
                              boxShadow: '0 2px 8px rgba(0,113,227,0.25)',
                            }}
                          >
                            <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                            Limpar filtro de data e ver tudo
                          </button>
                        </>
                      ) : temFiltroAtivo ? (
                        <p className="text-xs mt-0.5">Tente ajustar os filtros das colunas</p>
                      ) : (
                        <p className="text-xs mt-0.5">Pedidos aprovados aparecerão aqui</p>
                      )}
                    </div>
                  </div>
                ) : (
                  pedidosFiltrados.map((pedido, idx) => {
                    const fipNum = pedido.numero_pedido_fip
                      ? `FIP-${String(pedido.numero_pedido_fip).padStart(4, '0')}`
                      : `#${pedido.numero}`
                    return (
                      <div
                        key={pedido.id}
                        className="grid items-center px-4 py-3 transition-colors"
                        style={{
                          gridTemplateColumns: gridCols,
                          gap: '8px',
                          background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                          borderBottom: '1px solid var(--border)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}
                      >
                        {/* Pedido (Nº FIP) */}
                        <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded-md text-center" style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}>
                          {fipNum}
                        </span>

                        {/* Fornecedor */}
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>
                            {pedido.fornecedor_razao_social}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: 'var(--text-3)' }}>
                            {formatCnpj(pedido.fornecedor_cnpj)}
                          </p>
                        </div>

                        {/* Solicitante */}
                        <span className="text-xs truncate" style={{ color: 'var(--text-2)' }} title={pedido.solicitante?.email ?? undefined}>
                          {nomeExibicao(pedido.solicitante)}
                        </span>

                        {/* Data solicitação */}
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {formatDateBR(pedido.data_solicitacao)}
                        </span>

                        {/* Aprovador */}
                        <span className="text-xs truncate" style={{ color: 'var(--text-2)' }} title={pedido.aprovador?.email ?? undefined}>
                          {nomeExibicao(pedido.aprovador)}
                        </span>

                        {/* Data aprovação */}
                        <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                          {formatDateBR(pedido.data_aprovacao)}
                        </span>

                        {/* Valor */}
                        <span className="text-xs font-semibold text-right" style={{ color: 'var(--text-1)' }}>
                          {formatCurrency(pedido.valor_total)}
                        </span>

                        {/* Status */}
                        <div className="flex items-center gap-1">
                          <StatusBadge status={pedido.status_documento} />
                          {pedido.status_documento === 'nf_recebida' && (
                            <button
                              onClick={() => marcarPago(pedido)}
                              title="Marcar como Pago"
                              className="w-5 h-5 rounded-full flex items-center justify-center transition-all"
                              style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.25)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)' }}
                            >
                              <Banknote className="w-3 h-3" strokeWidth={2} />
                            </button>
                          )}
                        </div>

                        {/* PDF Pedido */}
                        <div className="flex justify-center">
                          <PdfIcon
                            url={pedido.pedido_pdf_url}
                            nome={pedido.pedido_pdf_nome}
                            onClick={() => setPdfModal({ url: pedido.pedido_pdf_url!, nome: pedido.pedido_pdf_nome ?? fipNum })}
                          />
                        </div>

                        {/* PDF NF / Anexar NF */}
                        <div className="flex justify-center">
                          {pedido.nf_pdf_url ? (
                            <PdfIcon
                              url={pedido.nf_pdf_url}
                              nome={`NF-${pedido.nf_numero ?? 'doc'}.pdf`}
                              onClick={() => setPdfModal({ url: pedido.nf_pdf_url!, nome: `NF-${pedido.nf_numero ?? 'doc'}.pdf` })}
                            />
                          ) : (
                            <button
                              onClick={() => setAnexarNfPedido(pedido)}
                              title="Anexar Nota Fiscal"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all"
                              style={{ background: 'rgba(245,158,11,0.10)', color: '#F59E0B' }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.22)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.10)' }}
                            >
                              <Paperclip className="w-4 h-4" strokeWidth={1.5} />
                            </button>
                          )}
                        </div>

                        {/* Coluna de ações: desaprovar (permissão aprovar) + excluir (admin) */}
                        {mostrarAcoes && (
                          <div className="flex justify-center gap-1">
                            {podeDesaprovar && (
                              <button
                                onClick={() => desaprovarPedido(pedido)}
                                disabled={desaprovandoId === pedido.id}
                                title="Desaprovar pedido (volta para rascunho)"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                                style={{ background: 'rgba(245,158,11,0.10)', color: '#F59E0B' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.22)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.10)' }}
                              >
                                {desaprovandoId === pedido.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Undo2 className="w-3.5 h-3.5" strokeWidth={1.8} />}
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => excluirPedido(pedido)}
                                disabled={excluindoId === pedido.id}
                                title="Excluir pedido (apenas admin)"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
                                style={{ background: 'rgba(239,68,68,0.10)', color: '#EF4444' }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.22)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)' }}
                              >
                                {excluindoId === pedido.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}

                {/* Footer com total */}
                {pedidosFiltrados.length > 0 && (
                  <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ background: 'var(--surface-3)', borderTop: '1px solid var(--border)' }}
                  >
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {pedidosFiltrados.length} de {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total filtrado:</span>
                      <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalFiltrado)}</span>
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </MaximizableCard>
      </div>

      {/* Modal de preview PDF */}
      {pdfModal && (
        <PdfPreviewModal url={pdfModal.url} nome={pdfModal.nome} onClose={() => setPdfModal(null)} />
      )}

      {/* Modal de anexar NF */}
      {anexarNfPedido && (
        <AnexarNfModal
          pedido={anexarNfPedido}
          onClose={() => setAnexarNfPedido(null)}
          onSaved={onNfSaved}
        />
      )}
    </div>
  )
}
