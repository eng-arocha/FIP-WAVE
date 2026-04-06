'use client'

import { use, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowLeft, Plus, Trash2, Package, Save,
  Building2, ChevronDown, Search, MapPin, X, Hash, Upload, FileText,
} from 'lucide-react'

// ── Máscaras ───────────────────────────────────────────────────────────────
function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

function maskTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Tarefa {
  id: string
  codigo: string
  nome: string
  valor_material: number
  valor_servico: number
  valor_total: number
  valor_aprovado: number
  locais: string[]
  grupo_macro?: { codigo: string; nome: string }
}

interface ItemForm {
  tarefa_id: string
  descricao: string
  local: string
  valor_total: string
}

// ── Searchable combobox ────────────────────────────────────────────────────
function DisciplinaCombobox({
  tarefas,
  value,
  localFilter,
  onChange,
}: {
  tarefas: Tarefa[]
  value: string
  localFilter: string
  onChange: (tarefaId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = tarefas.find(t => t.id === value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = tarefas.filter(t => {
    const matchLocal = !localFilter.trim() ||
      t.locais.some(l => l.includes(localFilter.trim().toUpperCase())) ||
      t.locais.length === 0
    const q = query.toLowerCase()
    const matchQuery = !q || t.codigo.toLowerCase().includes(q) || t.nome.toLowerCase().includes(q)
    return matchLocal && matchQuery
  })

  function handleSelect(t: Tarefa) {
    onChange(t.id)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div ref={ref} className="relative">
      <div
        className="w-full rounded-xl flex items-center gap-2 px-3 py-2.5 cursor-text"
        style={{ background: 'var(--surface-2)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, boxShadow: open ? '0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)' : 'none' }}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        {selected && !open ? (
          <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-1)' }}>
            <span style={{ color: 'var(--accent)' }}>{selected.codigo}</span>
            {' — '}{selected.nome.substring(0, 50)}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? `${selected.codigo} — ${selected.nome.substring(0, 40)}` : 'Digite o código (ex: 12.1) ou nome...'}
            className="flex-1 text-sm outline-none bg-transparent"
            style={{ color: 'var(--text-1)' }}
          />
        )}
        {value && (
          <button onClick={e => { e.stopPropagation(); handleClear() }} className="flex-shrink-0 rounded-full p-0.5" style={{ color: 'var(--text-3)' }}>
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        )}
        <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
      </div>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-auto shadow-lg"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              Nenhuma disciplina encontrada
              {localFilter && <span className="block text-xs mt-0.5">para o local "{localFilter}"</span>}
            </div>
          ) : (
            filtered.map(t => {
              const saldoDisp = t.valor_material - t.valor_aprovado
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span className="text-xs font-bold font-mono px-1.5 py-0.5 rounded-md flex-shrink-0" style={{ background: 'var(--accent)', color: 'white', minWidth: 40, textAlign: 'center' }}>
                    {t.codigo}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate" style={{ color: 'var(--text-1)' }}>{t.nome.substring(0, 60)}</span>
                    {t.locais.length > 0 && (
                      <span className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-3)' }}>
                        <MapPin className="w-2.5 h-2.5" strokeWidth={1.5} />
                        {t.locais.slice(0, 3).join(' · ')}{t.locais.length > 3 ? '…' : ''}
                      </span>
                    )}
                  </span>
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: saldoDisp <= 0 ? 'var(--red)' : 'var(--green)' }}>
                    {formatCurrency(saldoDisp)}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Página Principal ──────────────────────────────────────────────────────
export default function NovaSolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const supplierCardRef = useRef<HTMLDivElement>(null)
  const [stickyVisible, setStickyVisible] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  // Dados do Fornecedor
  const [fornRazaoSocial, setFornRazaoSocial] = useState('')
  const [fornCnpj, setFornCnpj] = useState('')           // masked value
  const [fornContatoNome, setFornContatoNome] = useState('')
  const [fornContatoTel, setFornContatoTel] = useState('') // masked value
  const [numeroPedidoFip, setNumeroPedidoFip] = useState('')

  const [observacoes, setObservacoes] = useState('')
  const [pedidoPdfFile, setPedidoPdfFile] = useState<File | null>(null)
  const [itens, setItens] = useState<ItemForm[]>([
    { tarefa_id: '', descricao: '', local: '', valor_total: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    fetch(`/api/contratos/${id}/fat-direto/tarefas`)
      .then(r => r.json())
      .then(data => setTarefas(Array.isArray(data) ? data : []))
  }, [id])

  useEffect(() => {
    if (!supplierCardRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-56px 0px 0px 0px' }
    )
    observer.observe(supplierCardRef.current)
    return () => observer.disconnect()
  }, [])

  function addItem() {
    setItens(prev => [...prev, { tarefa_id: '', descricao: '', local: '', valor_total: '' }])
  }

  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function onTarefaChange(i: number, tarefaId: string) {
    const t = tarefas.find(t => t.id === tarefaId)
    const autoLocal = t?.locais?.[0] ?? itens[i].local
    // Pré-preenche o valor com o total do detalhamento (quantidade × valor_unitário)
    const autoValor = t && t.valor_material > 0
      ? String(t.valor_material)
      : itens[i].valor_total
    setItens(prev => prev.map((item, idx) =>
      idx === i ? {
        ...item,
        tarefa_id: tarefaId,
        descricao: t ? t.nome.substring(0, 80) : item.descricao,
        local: autoLocal || item.local,
        valor_total: autoValor,
      } : item
    ))
  }

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor_total) || 0), 0)

  async function salvar() {
    setErro('')
    if (!fornRazaoSocial.trim()) { setErro('Informe a Razão Social do fornecedor.'); return }
    if (!fornCnpj.trim()) { setErro('Informe o CNPJ do fornecedor.'); return }
    if (!fornContatoNome.trim()) { setErro('Informe o Nome do contato.'); return }
    if (!fornContatoTel.trim()) { setErro('Informe o Telefone do contato.'); return }
    if (!numeroPedidoFip.trim() || isNaN(parseInt(numeroPedidoFip, 10))) {
      setErro('Informe o Nº Pedido Interno FIP (número inteiro).'); return
    }
    for (const it of itens) {
      if (!it.tarefa_id || !it.descricao || !it.local) { setErro('Preencha todos os campos de cada item.'); return }
      if (!it.valor_total || parseFloat(it.valor_total) <= 0) { setErro('Informe o valor de cada item.'); return }
    }
    setSaving(true)
    try {
      // Dígitos apenas para CNPJ e telefone
      const cnpjDigits = fornCnpj.replace(/\D/g, '')
      const telDigits = fornContatoTel.replace(/\D/g, '')

      const payload = {
        fornecedor_razao_social: fornRazaoSocial,
        fornecedor_cnpj: cnpjDigits,
        fornecedor_contato: `${fornContatoNome} / ${fornContatoTel}`,
        fornecedor_contato_nome: fornContatoNome,
        fornecedor_contato_telefone: telDigits,
        numero_pedido_fip: parseInt(numeroPedidoFip, 10),
        observacoes,
        itens: itens.map(it => ({
          tarefa_id: it.tarefa_id,
          descricao: it.descricao,
          local: it.local,
          valor_total: parseFloat(it.valor_total) || 0,
        })),
      }
      const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao salvar'); setSaving(false); return }

      // Upload do PDF do pedido (se selecionado)
      if (pedidoPdfFile) {
        const fd = new FormData()
        fd.append('file', pedidoPdfFile)
        fd.append('solicitacao_id', data.id)
        fd.append('tipo', 'pedido')
        fd.append('numero_pedido_fip', numeroPedidoFip)
        await fetch('/api/fat-direto/upload', { method: 'POST', body: fd })
      }

      router.push(`/contratos/${id}/fat-direto/${data.id}`)
    } catch (e: any) {
      setErro(e.message)
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all'
  const inputStyle = { background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }
  const focusHandlers = {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--accent)'
      e.currentTarget.style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)'
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = 'var(--border)'
      e.currentTarget.style.boxShadow = 'none'
    },
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title="Nova Solicitação" />

      {/* Sticky banner */}
      <div
        className="sticky top-14 z-20 transition-all duration-300 overflow-hidden"
        style={{ maxHeight: stickyVisible && fornRazaoSocial ? 48 : 0, opacity: stickyVisible && fornRazaoSocial ? 1 : 0 }}
      >
        <div className="flex items-center gap-3 px-6 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }}>
            <Building2 className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Fornecedor:</span>
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{fornRazaoSocial}</span>
          {fornCnpj && <span className="text-xs ml-1 hidden sm:block" style={{ color: 'var(--text-3)' }}>· CNPJ {fornCnpj}</span>}
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" size="sm" className="gap-2" style={{ color: 'var(--text-3)' }}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> Faturamento Direto
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Package className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
              Nova Solicitação de Autorização
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Solicite autorização WAVE para compra de materiais</p>
          </div>
        </div>

        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--red)' }}>
            {erro}
          </div>
        )}

        {/* ── Dados do Fornecedor ── */}
        <div ref={supplierCardRef}>
          <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
                <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }}>
                  <Building2 className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
                </span>
                Dados do Fornecedor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Razão Social */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Razão Social *</label>
                <input type="text" value={fornRazaoSocial} onChange={e => setFornRazaoSocial(e.target.value)}
                  placeholder="Nome completo da empresa fornecedora" className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>

              {/* CNPJ + Nº Pedido FIP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>CNPJ *</label>
                  <input
                    type="text"
                    value={fornCnpj}
                    onChange={e => setFornCnpj(maskCnpj(e.target.value))}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className={inputCls} style={inputStyle} {...focusHandlers}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                    <Hash className="w-3 h-3" strokeWidth={1.5} /> Nº Pedido Interno FIP *
                  </label>
                  <input
                    type="number"
                    value={numeroPedidoFip}
                    onChange={e => setNumeroPedidoFip(e.target.value)}
                    placeholder="Ex: 1023"
                    min="1"
                    step="1"
                    className={inputCls} style={inputStyle} {...focusHandlers}
                  />
                </div>
              </div>

              {/* Nome + Telefone do contato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Nome do Contato *</label>
                  <input type="text" value={fornContatoNome} onChange={e => setFornContatoNome(e.target.value)}
                    placeholder="Nome do responsável" className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Telefone *</label>
                  <input
                    type="tel"
                    value={fornContatoTel}
                    onChange={e => setFornContatoTel(maskTelefone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                    className={inputCls} style={inputStyle} {...focusHandlers}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Observações ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="Justificativa ou observações para esta solicitação..." rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-all"
              style={inputStyle} {...focusHandlers} />
          </CardContent>
        </Card>

        {/* ── Pedido FIP em PDF ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #EF4444, #F97316)' }}>
                <FileText className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </span>
              Pedido FIP em PDF
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-3)' }}>(opcional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all"
              style={{
                background: pedidoPdfFile ? 'rgba(239,68,68,0.05)' : 'var(--surface-3)',
                border: `1.5px dashed ${pedidoPdfFile ? 'rgba(239,68,68,0.40)' : 'var(--border)'}`,
              }}
              onClick={() => pdfInputRef.current?.click()}
              onMouseEnter={e => { if (!pedidoPdfFile) e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { if (!pedidoPdfFile) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <Upload className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: pedidoPdfFile ? '#EF4444' : 'var(--text-3)' }} />
              <div className="flex-1 min-w-0">
                {pedidoPdfFile ? (
                  <>
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-1)' }}>{pedidoPdfFile.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                      {(pedidoPdfFile.size / 1024 / 1024).toFixed(2)} MB · Será salvo como{' '}
                      <span className="font-medium" style={{ color: 'var(--accent)' }}>
                        PEDIDO-FIP-{numeroPedidoFip ? numeroPedidoFip.padStart(4, '0') : '????'}.pdf
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm" style={{ color: 'var(--text-3)' }}>Clique para selecionar o PDF do pedido aprovado</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)', opacity: 0.7 }}>
                      Será armazenado como PEDIDO-FIP-{numeroPedidoFip ? numeroPedidoFip.padStart(4, '0') : '????'}.pdf
                    </p>
                  </>
                )}
              </div>
              {pedidoPdfFile && (
                <button
                  onClick={e => { e.stopPropagation(); setPedidoPdfFile(null) }}
                  className="flex-shrink-0 p-1 rounded-full transition-colors"
                  style={{ color: 'var(--text-3)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              )}
            </div>
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => setPedidoPdfFile(e.target.files?.[0] ?? null)}
            />
          </CardContent>
        </Card>

        {/* ── Itens da Solicitação ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Itens da Solicitação</CardTitle>
            <Button onClick={addItem} size="sm" variant="ghost" className="gap-1" style={{ color: 'var(--accent)' }}>
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((item, i) => (
              <div
                key={i}
                className="p-4 rounded-xl space-y-3"
                style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Item {i + 1}</span>
                  {itens.length > 1 && (
                    <button onClick={() => removeItem(i)} style={{ color: 'var(--text-3)' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}>
                      <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Disciplina / Tarefa</label>
                    <DisciplinaCombobox tarefas={tarefas} value={item.tarefa_id} localFilter={item.local} onChange={(tid) => onTarefaChange(i, tid)} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Local</label>
                    <input type="text" value={item.local} onChange={e => updateItem(i, 'local', e.target.value)}
                      placeholder="TORRE, AP-101, ÁREA COMUM..." className={inputCls} style={inputStyle} {...focusHandlers} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Descrição do Material</label>
                  <input type="text" value={item.descricao} onChange={e => updateItem(i, 'descricao', e.target.value)}
                    placeholder="Descreva o material a ser adquirido..."
                    className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>

                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Valor do Item (R$)</label>
                  <input type="number" value={item.valor_total} onChange={e => updateItem(i, 'valor_total', e.target.value)}
                    min="0" step="0.01" placeholder="0,00" className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Total da Solicitação</span>
              <span className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" style={{ color: 'var(--text-3)' }}>Cancelar</Button>
          </Link>
          <Button
            onClick={salvar}
            disabled={saving}
            className="gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Enviando...
              </>
            ) : (
              <><Save className="w-4 h-4" strokeWidth={1.5} /> Enviar para Aprovação</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
