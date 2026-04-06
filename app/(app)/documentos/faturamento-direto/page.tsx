'use client'

import { useState, useEffect, useRef } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { PdfPreviewModal } from '@/components/pdf-preview-modal'
import { formatCurrency } from '@/lib/utils'
import {
  FileText, Search, Filter, Download, Clock, CheckCircle2, Banknote,
  X, Upload, RefreshCw, FolderOpen, Receipt, ChevronDown,
  Paperclip, FileCheck,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Contrato { id: string; codigo: string; nome: string }
interface Pedido {
  id: string
  numero: number
  status: string
  data_solicitacao: string
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

// ── Página Principal ──────────────────────────────────────────────────────
export default function PedidosFatDiretoPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [nfBusca, setNfBusca] = useState('')
  const [contratoFiltro, setContratoFiltro] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('')

  // Modais
  const [pdfModal, setPdfModal] = useState<{ url: string; nome: string } | null>(null)
  const [anexarNfPedido, setAnexarNfPedido] = useState<Pedido | null>(null)

  async function carregar() {
    setLoading(true)
    const params = new URLSearchParams()
    if (dataInicio) params.set('data_inicio', dataInicio)
    if (dataFim) params.set('data_fim', dataFim)
    if (nfBusca) params.set('nf_numero', nfBusca)
    if (contratoFiltro) params.set('contrato_id', contratoFiltro)
    if (statusFiltro) params.set('status_documento', statusFiltro)

    const res = await fetch(`/api/fat-direto/documentos?${params}`)
    if (res.ok) setPedidos(await res.json())
    setLoading(false)
  }

  // Carregar contratos para o filtro
  async function carregarContratos() {
    const res = await fetch('/api/contratos')
    if (res.ok) {
      const data = await res.json()
      setContratos(Array.isArray(data) ? data : data.contratos ?? [])
    }
  }

  useEffect(() => {
    carregarContratos()
    carregar()
  }, [])

  function limparFiltros() {
    setDataInicio(''); setDataFim(''); setNfBusca(''); setContratoFiltro(''); setStatusFiltro('')
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

  // Exportar CSV
  function exportCsv() {
    const cols = ['Data', 'Nº FIP', 'Contrato', 'Fornecedor', 'CNPJ', 'Valor Total', 'Nº NF', 'Data NF', 'Status']
    const rows = pedidos.map(p => [
      formatDateBR(p.data_solicitacao),
      p.numero_pedido_fip ? `FIP-${String(p.numero_pedido_fip).padStart(4,'0')}` : p.numero,
      p.contrato?.codigo ?? '',
      p.fornecedor_razao_social,
      formatCnpj(p.fornecedor_cnpj),
      p.valor_total,
      p.nf_numero ?? '',
      p.nf_data ? formatDateBR(p.nf_data) : '',
      STATUS_DOC[p.status_documento]?.label ?? p.status_documento,
    ])
    const csv = [cols, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pedidos-faturamento-direto-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
  }

  const totalFiltrado = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0)
  const temFiltroAtivo = !!(dataInicio || dataFim || nfBusca || contratoFiltro || statusFiltro)

  const inputCls = 'rounded-xl px-3 py-2 text-sm outline-none transition-all'
  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title="Pedidos Aprovados — Faturamento Direto" />

      <div className="flex-1 p-6 space-y-5 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #EF4444, #F97316)' }}>
                <FolderOpen className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </span>
              Pedidos Aprovados — Faturamento Direto
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--text-3)' }}>
              Gerencie PDFs de pedidos, vincule notas fiscais e acompanhe pagamentos
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

        {/* Filtros */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Filtros</span>
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                <X className="w-3 h-3" strokeWidth={2} /> Limpar
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {/* Período */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Data início</label>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Data fim</label>
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

            {/* Contrato */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Contrato</label>
              <select value={contratoFiltro} onChange={e => setContratoFiltro(e.target.value)}
                className={`${inputCls} w-full`} style={inputStyle}>
                <option value="">Todos</option>
                {contratos.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}
              </select>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium" style={{ color: 'var(--text-3)' }}>Status</label>
              <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)}
                className={`${inputCls} w-full`} style={inputStyle}>
                <option value="">Todos</option>
                {Object.entries(STATUS_DOC).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={carregar}
              size="sm"
              className="gap-1.5 text-white"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
            >
              <Search className="w-3.5 h-3.5" strokeWidth={1.5} /> Buscar
            </Button>
          </div>
        </div>

        {/* Tabela */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {/* Header da tabela */}
          <div
            className="grid text-[11px] font-semibold uppercase tracking-wide px-4 py-2.5"
            style={{
              gridTemplateColumns: '90px 80px 100px 1fr 90px 80px 80px 90px 80px 80px',
              gap: '8px',
              background: 'var(--surface-3)',
              borderBottom: '1px solid var(--border)',
              color: 'var(--text-3)',
            }}
          >
            <span>Data</span>
            <span>Nº FIP</span>
            <span>Contrato</span>
            <span>Fornecedor</span>
            <span className="text-right">Valor</span>
            <span>Nº NF</span>
            <span>Data NF</span>
            <span>Status</span>
            <span className="text-center">Pedido</span>
            <span className="text-center">NF</span>
          </div>

          {/* Linhas */}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3" style={{ color: 'var(--text-3)' }}>
              <RefreshCw className="w-5 h-5 animate-spin" strokeWidth={1.5} />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : pedidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: 'var(--text-3)' }}>
              <FolderOpen className="w-10 h-10 opacity-30" strokeWidth={1} />
              <div className="text-center">
                <p className="text-sm font-medium">Nenhum pedido encontrado</p>
                <p className="text-xs mt-0.5">
                  {temFiltroAtivo ? 'Tente ajustar os filtros' : 'Pedidos aprovados com PDF aparecerão aqui'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {pedidos.map((pedido, idx) => {
                const fipNum = pedido.numero_pedido_fip
                  ? `FIP-${String(pedido.numero_pedido_fip).padStart(4, '0')}`
                  : `#${pedido.numero}`
                return (
                  <div
                    key={pedido.id}
                    className="grid items-center px-4 py-3 transition-colors"
                    style={{
                      gridTemplateColumns: '90px 80px 100px 1fr 90px 80px 80px 90px 80px 80px',
                      gap: '8px',
                      background: idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)' }}
                  >
                    {/* Data */}
                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                      {formatDateBR(pedido.data_solicitacao)}
                    </span>

                    {/* Nº FIP */}
                    <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded-md text-center" style={{ background: 'var(--surface-3)', color: 'var(--accent)' }}>
                      {fipNum}
                    </span>

                    {/* Contrato */}
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-2)' }}>
                      {pedido.contrato?.codigo ?? '—'}
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

                    {/* Valor */}
                    <span className="text-xs font-semibold text-right" style={{ color: 'var(--text-1)' }}>
                      {formatCurrency(pedido.valor_total)}
                    </span>

                    {/* Nº NF */}
                    <span className="text-xs" style={{ color: pedido.nf_numero ? 'var(--text-2)' : 'var(--text-3)' }}>
                      {pedido.nf_numero ?? '—'}
                    </span>

                    {/* Data NF */}
                    <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                      {formatDateBR(pedido.nf_data)}
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
                  </div>
                )
              })}
            </>
          )}

          {/* Footer com total */}
          {pedidos.length > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: 'var(--surface-3)', borderTop: '1px solid var(--border)' }}
            >
              <span className="text-xs" style={{ color: 'var(--text-3)' }}>
                {pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''} encontrado{pedidos.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-3)' }}>Total filtrado:</span>
                <span className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(totalFiltrado)}</span>
              </div>
            </div>
          )}
        </div>
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
