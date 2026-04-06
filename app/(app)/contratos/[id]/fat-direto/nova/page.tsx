'use client'

import { use, useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowLeft, Plus, Trash2, Package, Save, AlertTriangle,
  Building2, ChevronDown, Search, MapPin, X, Hash,
} from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────
interface Detalhamento {
  id: string
  codigo: string        // ex: "1.1.1"
  descricao: string
  local: string         // ex: "TORRE"
  valor_material: number  // valor máximo de material (qtde * valor_material_unit)
  valor_aprovado: number  // já aprovado para este item
  tarefa_id: string
  tarefa_codigo: string   // ex: "1.1"
  tarefa_nome: string
}

interface ItemForm {
  detalhamento_id: string
  descricao: string
  local: string
  valor_total: string
}

// ── Combobox Disciplina / Tarefa (Nivel 3) ────────────────────────────────
function DisciplinaCombobox({
  detalhamentos,
  value,
  localFilter,
  onChange,
}: {
  detalhamentos: Detalhamento[]
  value: string
  localFilter: string
  onChange: (detId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = detalhamentos.find(d => d.id === value)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = detalhamentos.filter(d => {
    const matchLocal = !localFilter || d.local === localFilter
    const q = query.toLowerCase()
    const matchQuery = !q || d.codigo.toLowerCase().includes(q) || d.descricao.toLowerCase().includes(q)
    return matchLocal && matchQuery
  })

  function handleSelect(d: Detalhamento) {
    onChange(d.id)
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
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
        }}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        {selected && !open ? (
          <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-1)' }}>
            <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{selected.codigo}</span>
            {' — '}{selected.descricao.substring(0, 48)}
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? `${selected.codigo} — ${selected.descricao.substring(0, 38)}` : 'Digite o código (ex: 1.1.1) ou descrição...'}
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
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 280, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-3)' }}>
              Nenhum item encontrado{localFilter ? ` para local "${localFilter}"` : ''}
            </div>
          ) : (
            filtered.map(d => {
              const saldoDisp = d.valor_material - d.valor_aprovado
              return (
                <button
                  key={d.id}
                  onClick={() => handleSelect(d)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span
                    className="text-xs font-bold font-mono px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: 'var(--accent)', color: 'white', minWidth: 44, textAlign: 'center' }}
                  >
                    {d.codigo}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate" style={{ color: 'var(--text-1)' }}>{d.descricao.substring(0, 60)}</span>
                    <span className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-3)' }}>
                      <MapPin className="w-2.5 h-2.5" strokeWidth={1.5} />
                      {d.local} · {d.tarefa_codigo} {d.tarefa_nome.substring(0, 28)}
                    </span>
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

// ── Combobox Local ────────────────────────────────────────────────────────
function LocalCombobox({
  options,
  value,
  disabled,
  onChange,
}: {
  options: string[]
  value: string
  disabled?: boolean
  onChange: (local: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = options.filter(l => !query || l.toLowerCase().includes(query.toLowerCase()))

  function handleSelect(l: string) {
    onChange(l)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setQuery('')
    inputRef.current?.focus()
  }

  return (
    <div ref={ref} className={`relative ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      <div
        className="w-full rounded-xl flex items-center gap-2 px-3 py-2.5 cursor-text"
        style={{
          background: 'var(--surface-2)',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
        }}
        onClick={() => { if (!disabled) { setOpen(true); inputRef.current?.focus() } }}
      >
        <MapPin className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        {value && !open ? (
          <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-1)' }}>{value}</span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={value || 'Selecione o local...'}
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
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 220, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-3)' }}>Nenhum local encontrado</div>
          ) : (
            filtered.map(l => (
              <button
                key={l}
                onClick={() => handleSelect(l)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors"
                style={{ borderBottom: '1px solid var(--border)', color: l === value ? 'var(--accent)' : 'var(--text-1)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <MapPin className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
                {l}
              </button>
            ))
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
  const [detalhamentos, setDetalhamentos] = useState<Detalhamento[]>([])
  const supplierCardRef = useRef<HTMLDivElement>(null)
  const [stickyVisible, setStickyVisible] = useState(false)

  // Dados do Fornecedor
  const [fornRazaoSocial, setFornRazaoSocial] = useState('')
  const [fornCnpj, setFornCnpj] = useState('')
  const [fornContatoNome, setFornContatoNome] = useState('')
  const [fornContatoTel, setFornContatoTel] = useState('')
  const [numeroPedidoFip, setNumeroPedidoFip] = useState('')

  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([
    { detalhamento_id: '', descricao: '', local: '', valor_total: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [tetoViolation, setTetoViolation] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/contratos/${id}/fat-direto/tarefas`)
      .then(r => r.json())
      .then(data => setDetalhamentos(Array.isArray(data) ? data : []))
  }, [id])

  // Sticky banner
  useEffect(() => {
    if (!supplierCardRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-56px 0px 0px 0px' }
    )
    observer.observe(supplierCardRef.current)
    return () => observer.disconnect()
  }, [])

  // Todos os locais distintos
  const allLocais = useMemo(() => {
    const s = new Set<string>()
    detalhamentos.forEach(d => { if (d.local) s.add(d.local) })
    return Array.from(s).sort()
  }, [detalhamentos])

  function addItem() {
    setItens(prev => [...prev, { detalhamento_id: '', descricao: '', local: '', valor_total: '' }])
  }

  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  // Ao selecionar detalhamento → auto-preenche local e descrição
  function onDetalhamentoChange(i: number, detId: string) {
    const d = detalhamentos.find(x => x.id === detId)
    setItens(prev => prev.map((item, idx) =>
      idx === i ? {
        ...item,
        detalhamento_id: detId,
        descricao: d ? d.descricao.substring(0, 120) : item.descricao,
        local: d ? d.local : item.local,
      } : item
    ))
  }

  // Ao selecionar local → limpa detalhamento se ele não pertence ao novo local
  function onLocalChange(i: number, local: string) {
    setItens(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const det = detalhamentos.find(d => d.id === item.detalhamento_id)
      const clearDet = det && local && det.local !== local
      return {
        ...item,
        local,
        detalhamento_id: clearDet ? '' : item.detalhamento_id,
        descricao: clearDet ? '' : item.descricao,
      }
    }))
  }

  // Locais disponíveis para um item (filtra pelo detalhamento selecionado ou mostra todos)
  function getLocaisForItem(item: ItemForm): string[] {
    const det = detalhamentos.find(d => d.id === item.detalhamento_id)
    if (det) return [det.local]  // detalhamento selecionado → só o local dele
    return allLocais
  }

  // Saldo por detalhamento, contabilizando outros itens do MESMO formulário
  function getSaldoInfo(item: ItemForm, itemIndex: number) {
    const det = detalhamentos.find(x => x.id === item.detalhamento_id)
    if (!det || !item.detalhamento_id) return null

    const valorAtual = parseFloat(item.valor_total) || 0

    // Soma de OUTROS itens deste formulário com o mesmo detalhamento
    const valorOutrosItens = itens.reduce((sum, it, idx) => {
      if (idx === itemIndex) return sum
      if (it.detalhamento_id !== item.detalhamento_id) return sum
      return sum + (parseFloat(it.valor_total) || 0)
    }, 0)

    const jaComprometido = det.valor_aprovado + valorOutrosItens
    const totalComAtual = jaComprometido + valorAtual
    const saldoDisponivel = det.valor_material - totalComAtual
    const maxSolicitavel = Math.max(0, det.valor_material - jaComprometido)

    return {
      jaAprovado: det.valor_aprovado,
      valorOutrosItens,
      totalComAtual,
      limite: det.valor_material,
      saldoDisponivel,
      extrapolado: saldoDisponivel < 0,
      maxSolicitavel,
    }
  }

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor_total) || 0), 0)

  // Verifica se algum item está extrapolado (bloqueia envio)
  const hasSaldoExcedido = itens.some((it, i) => {
    const s = getSaldoInfo(it, i)
    return s?.extrapolado === true
  })

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
      if (!it.detalhamento_id) { setErro('Selecione a Disciplina/Tarefa de cada item.'); return }
      if (!it.local) { setErro('Selecione o Local de cada item.'); return }
      if (!it.descricao) { setErro('Informe a Descrição de cada item.'); return }
      if (!it.valor_total || parseFloat(it.valor_total) <= 0) { setErro('Informe o Valor de cada item.'); return }
    }
    if (hasSaldoExcedido) {
      setErro('Corrija os itens com "Saldo excedido" antes de enviar.')
      return
    }

    setSaving(true)
    try {
      const det = (id: string) => detalhamentos.find(d => d.id === id)
      const payload = {
        fornecedor_razao_social: fornRazaoSocial,
        fornecedor_cnpj: fornCnpj,
        fornecedor_contato: `${fornContatoNome} / ${fornContatoTel}`,
        fornecedor_contato_nome: fornContatoNome,
        fornecedor_contato_telefone: fornContatoTel,
        numero_pedido_fip: parseInt(numeroPedidoFip, 10),
        observacoes,
        itens: itens.map(it => ({
          tarefa_id: det(it.detalhamento_id)?.tarefa_id || '',
          detalhamento_id: it.detalhamento_id,
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
      if (res.status === 422 && data.error === 'TETO_EXCEDIDO') {
        setTetoViolation(data.violation)
        setSaving(false)
        return
      }
      if (!res.ok) { setErro(data.error || 'Erro ao salvar'); setSaving(false); return }
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

      {/* Sticky frozen company banner */}
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

        {/* Erros */}
        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--red)' }}>
            {erro}
          </div>
        )}

        {/* Alerta de teto global excedido */}
        {tetoViolation && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(239,68,68,0.07)', border: '2px solid rgba(239,68,68,0.40)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: 'var(--red)' }} />
              <div>
                <p className="font-bold text-base mb-1" style={{ color: 'var(--red)' }}>Saldo de Material Insuficiente</p>
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  A solicitação de <strong style={{ color: 'var(--red)' }}>{formatCurrency(tetoViolation.valor_novo)}</strong> excede o saldo de{' '}
                  <strong style={{ color: 'var(--red)' }}>{formatCurrency(tetoViolation.saldo_disponivel)}</strong>.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Teto do Contrato', value: tetoViolation.teto, color: 'var(--text-2)' },
                { label: 'Total Aprovado', value: tetoViolation.total_aprovado, color: 'var(--red)' },
                { label: 'Saldo Disponível', value: tetoViolation.saldo_disponivel, color: tetoViolation.saldo_disponivel <= 0 ? 'var(--red)' : 'var(--amber)' },
              ].map(k => (
                <div key={k.label} className="p-3 rounded-xl" style={{ background: 'var(--surface-3)' }}>
                  <p className="text-xs mb-1" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                  <p className="text-sm font-bold" style={{ color: k.color }}>{formatCurrency(k.value)}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setTetoViolation(null)} className="text-xs" style={{ color: 'var(--text-3)' }}>Fechar alerta</button>
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
              {/* Razão Social (full width) */}
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Razão Social *</label>
                <input type="text" value={fornRazaoSocial} onChange={e => setFornRazaoSocial(e.target.value)}
                  placeholder="Nome completo da empresa fornecedora" className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>

              {/* CNPJ + Nº Pedido FIP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>CNPJ *</label>
                  <input type="text" value={fornCnpj} onChange={e => setFornCnpj(e.target.value)}
                    placeholder="00.000.000/0001-00" className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                    <Hash className="w-3 h-3" strokeWidth={1.5} /> Nº Pedido Interno FIP *
                  </label>
                  <input type="number" value={numeroPedidoFip} onChange={e => setNumeroPedidoFip(e.target.value)}
                    placeholder="Ex: 1023" min="1" step="1"
                    className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
              </div>

              {/* Contato: Nome + Telefone separados */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Nome do Contato *</label>
                  <input type="text" value={fornContatoNome} onChange={e => setFornContatoNome(e.target.value)}
                    placeholder="Nome do responsável" className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Telefone *</label>
                  <input type="tel" value={fornContatoTel} onChange={e => setFornContatoTel(e.target.value)}
                    placeholder="(11) 99999-9999" className={inputCls} style={inputStyle} {...focusHandlers} />
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

        {/* ── Itens da Solicitação ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Itens da Solicitação</CardTitle>
            <Button onClick={addItem} size="sm" variant="ghost" className="gap-1" style={{ color: 'var(--accent)' }}>
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((item, i) => {
              const saldo = getSaldoInfo(item, i)
              return (
                <div
                  key={i}
                  className="p-4 rounded-xl space-y-3"
                  style={{
                    background: 'var(--surface-3)',
                    border: `1px solid ${saldo?.extrapolado ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>
                      Item {i + 1}
                    </span>
                    {itens.length > 1 && (
                      <button onClick={() => removeItem(i)} style={{ color: 'var(--text-3)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </div>

                  {/* Disciplina/Tarefa (Nivel 3) + Local */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Disciplina / Tarefa *</label>
                      <DisciplinaCombobox
                        detalhamentos={detalhamentos}
                        value={item.detalhamento_id}
                        localFilter={item.local}
                        onChange={(detId) => onDetalhamentoChange(i, detId)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Local *</label>
                      <LocalCombobox
                        options={getLocaisForItem(item)}
                        value={item.local}
                        onChange={(local) => onLocalChange(i, local)}
                      />
                    </div>
                  </div>

                  {/* Descrição do Material */}
                  <div>
                    <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Descrição do Material *</label>
                    <input type="text" value={item.descricao} onChange={e => updateItem(i, 'descricao', e.target.value)}
                      placeholder="Descreva o material a ser adquirido..."
                      className={inputCls} style={inputStyle} {...focusHandlers} />
                  </div>

                  {/* Valor + Saldo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Valor do Item (R$) *</label>
                      <input type="number" value={item.valor_total} onChange={e => updateItem(i, 'valor_total', e.target.value)}
                        min="0" step="0.01" placeholder="0,00"
                        className={inputCls} style={inputStyle} {...focusHandlers} />
                    </div>

                    <div>
                      <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Saldo Total do Item</label>
                      {saldo ? (
                        <div
                          className="rounded-xl px-3 py-2.5 text-sm space-y-0.5"
                          style={{
                            background: saldo.extrapolado ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.06)',
                            border: `1px solid ${saldo.extrapolado ? 'rgba(239,68,68,0.30)' : 'rgba(59,130,246,0.20)'}`,
                          }}
                        >
                          {saldo.extrapolado ? (
                            <>
                              <div className="font-bold flex items-center gap-1" style={{ color: 'var(--red)' }}>
                                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
                                Saldo excedido
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--red)' }}>
                                Máx. solicitável: {formatCurrency(saldo.maxSolicitavel)}
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                                Teto: {formatCurrency(saldo.limite)} · Já aprovado: {formatCurrency(saldo.jaAprovado)}
                                {saldo.valorOutrosItens > 0 && ` · Outros itens: ${formatCurrency(saldo.valorOutrosItens)}`}
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold" style={{ color: 'var(--accent)' }}>
                                Saldo: {formatCurrency(saldo.saldoDisponivel)}
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
                                Teto: {formatCurrency(saldo.limite)} · Aprovado: {formatCurrency(saldo.jaAprovado)}
                                {saldo.valorOutrosItens > 0 && ` · Outros itens: ${formatCurrency(saldo.valorOutrosItens)}`}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div
                          className="rounded-xl px-3 py-2.5 text-sm font-bold"
                          style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)', color: 'var(--accent)' }}
                        >
                          {formatCurrency(parseFloat(item.valor_total) || 0)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Total da Solicitação</span>
              <span className="text-xl font-black" style={{ color: 'var(--text-1)' }}>{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Aviso de saldo excedido acima do botão */}
        {hasSaldoExcedido && (
          <div className="p-3 rounded-xl text-sm flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--red)' }}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
            Há itens com saldo excedido. Corrija os valores antes de enviar.
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" style={{ color: 'var(--text-3)' }}>Cancelar</Button>
          </Link>
          <Button
            onClick={salvar}
            disabled={saving || hasSaldoExcedido}
            className="gap-2 text-white"
            style={{
              background: hasSaldoExcedido
                ? 'rgba(100,116,139,0.5)'
                : 'linear-gradient(135deg, var(--accent), var(--accent-glow))',
            }}
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
