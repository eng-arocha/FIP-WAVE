'use client'

import { use, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowLeft, Plus, Trash2, Package, Save, AlertTriangle,
  Building2, ChevronDown, Search, MapPin, X, Hash, Upload, FileText, TrendingUp, Paperclip,
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
  id: string         // detalhamento ID
  tarefa_id: string  // FK real para tarefas
  codigo: string
  nome: string
  valor_material: number
  valor_servico: number
  valor_total: number
  valor_aprovado: number
  valor_em_aprovacao: number
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
              const saldoDisp = t.valor_material - t.valor_aprovado - (t.valor_em_aprovacao || 0)
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

  // CNPJ lookup state
  const [cnpjLookupStatus, setCnpjLookupStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error' | 'inactive'>('idle')
  const [cnpjLookupMsg, setCnpjLookupMsg] = useState('')

  async function lookupCnpj(maskedValue: string) {
    const digits = maskedValue.replace(/\D/g, '')
    if (digits.length !== 14) return
    setCnpjLookupStatus('loading')
    setCnpjLookupMsg('')
    try {
      const res = await fetch(`/api/cnpj/${digits}`)
      const data = await res.json()
      if (res.status === 404) {
        setCnpjLookupStatus('not_found')
        setCnpjLookupMsg('CNPJ não encontrado na Receita Federal')
        setFornRazaoSocial('')
        return
      }
      if (!res.ok) {
        setCnpjLookupStatus('error')
        setCnpjLookupMsg(data.error || 'Erro ao consultar Receita Federal')
        return
      }
      if (!data.ativa) {
        setCnpjLookupStatus('inactive')
        setCnpjLookupMsg(`Empresa com situação: ${data.situacao_cadastral}`)
        setFornRazaoSocial(data.razao_social || '')
        return
      }
      setCnpjLookupStatus('found')
      setCnpjLookupMsg(`${data.municipio}/${data.uf}`)
      setFornRazaoSocial(data.razao_social || '')
    } catch {
      setCnpjLookupStatus('error')
      setCnpjLookupMsg('Falha na conexão com Receita Federal')
    }
  }

  function handleCnpjChange(raw: string) {
    const masked = maskCnpj(raw)
    setFornCnpj(masked)
    setCnpjLookupStatus('idle')
    setCnpjLookupMsg('')
    setFornRazaoSocial('')
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 14) lookupCnpj(masked)
  }

  const [observacoes, setObservacoes] = useState('')
  const [anexos, setAnexos] = useState<File[]>([])
  const parsePdfInputRef = useRef<HTMLInputElement>(null)
  const [parseStatus, setParseStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [parseMsg, setParseMsg] = useState('')
  const [parsedFields, setParsedFields] = useState<Set<string>>(new Set())

  async function handlePedidoPdfUpload(file: File) {
    // Adiciona o arquivo à lista de anexos automaticamente
    setAnexos(prev => [...prev, file])
    setParseStatus('loading')
    setParseMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/fat-direto/parse-pedido', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setParseStatus('error')
        setParseMsg(data.error || 'Não foi possível extrair os dados do PDF')
        return
      }
      const filled = new Set<string>()
      if (data.numero_pedido) { setNumeroPedidoFip(data.numero_pedido); filled.add('pedido') }
      if (data.razao_social)  { setFornRazaoSocial(data.razao_social); filled.add('razao') }
      if (data.cnpj) {
        // Dispara máscara + lookup Receita Federal
        handleCnpjChange(data.cnpj)
        filled.add('cnpj')
      }
      if (data.contato)  { setFornContatoNome(data.contato); filled.add('contato') }
      if (data.telefone) { setFornContatoTel(maskTelefone(data.telefone)); filled.add('tel') }
      setParsedFields(filled)
      setParseStatus('done')
      setParseMsg(`${filled.size} campo${filled.size !== 1 ? 's' : ''} preenchido${filled.size !== 1 ? 's' : ''} automaticamente`)
    } catch {
      setParseStatus('error')
      setParseMsg('Erro ao processar o PDF')
    }
  }

  const [itens, setItens] = useState<ItemForm[]>([
    { tarefa_id: '', descricao: '', local: '', valor_total: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [tetoViolation, setTetoViolation] = useState<any>(null)
  const [itemLimiteViolation, setItemLimiteViolation] = useState<any>(null)

  // Real-time per-item limit violations (nivel 3)
  const itemViolations = useMemo(() => {
    const out: Record<number, { aprovado: number; emAprovacao: number; saldo: number; limite: number; codigo: string }> = {}
    itens.forEach((item, i) => {
      if (!item.tarefa_id) return
      const t = tarefas.find(x => x.id === item.tarefa_id)
      if (!t || t.valor_material <= 0) return
      const valorAtual = parseFloat(item.valor_total) || 0
      if (valorAtual <= 0) return
      const aprovado = t.valor_aprovado
      const emAprovacao = t.valor_em_aprovacao || 0
      // Other items in this same form for same detalhamento
      const outrosItensForm = itens.reduce((sum, other, j) => {
        if (j === i && other.tarefa_id === item.tarefa_id) return sum
        if (other.tarefa_id === item.tarefa_id) return sum + (parseFloat(other.valor_total) || 0)
        return sum
      }, 0)
      const totalComprometido = aprovado + emAprovacao + outrosItensForm + valorAtual
      const saldo = Math.max(0, t.valor_material - aprovado - emAprovacao)
      if (totalComprometido > t.valor_material) {
        out[i] = { aprovado, emAprovacao, saldo, limite: t.valor_material, codigo: t.codigo }
      }
    })
    return out
  }, [itens, tarefas])

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
    if (Object.keys(itemViolations).length > 0) {
      setErro('Corrija os limites por disciplina antes de enviar.')
      return
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
        itens: itens.map(it => {
          const t = tarefas.find(x => x.id === it.tarefa_id)
          return {
            tarefa_id: t?.tarefa_id || it.tarefa_id, // FK real para tarefas
            detalhamento_id: it.tarefa_id,            // ID do detalhamento (nível 3)
            descricao: it.descricao,
            local: it.local,
            valor_total: parseFloat(it.valor_total) || 0,
          }
        }),
      }
      const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.status === 422 && data.error === 'TETO_EXCEDIDO') {
        setTetoViolation(data.violation); setSaving(false); return
      }
      if (res.status === 422 && data.error === 'ITEM_LIMITE_EXCEDIDO') {
        setItemLimiteViolation(data.itemViolation); setSaving(false); return
      }
      if (!res.ok) { setErro(data.error || 'Erro ao salvar'); setSaving(false); return }

      // Upload dos anexos (múltiplos arquivos)
      if (anexos.length > 0) {
        const fd = new FormData()
        anexos.forEach(f => fd.append('files', f))
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
        <div className="flex items-center gap-3 px-3 sm:px-6 py-2.5 border-b" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
          <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #3B82F6, #06B6D4)' }}>
            <Building2 className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-3)' }}>Fornecedor:</span>
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--text-1)' }}>{fornRazaoSocial}</span>
          {fornCnpj && <span className="text-xs ml-1 hidden sm:block" style={{ color: 'var(--text-3)' }}>· CNPJ {fornCnpj}</span>}
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3" style={{ color: 'var(--text-3)' }}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> <span className="hidden sm:inline">Faturamento Direto</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
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

        {tetoViolation && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(239,68,68,0.07)', border: '2px solid rgba(239,68,68,0.40)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: 'var(--red)' }} />
              <div>
                <p className="font-bold mb-0.5" style={{ color: 'var(--red)' }}>Saldo de Material Insuficiente</p>
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                  Solicitação de <strong style={{ color: 'var(--red)' }}>{formatCurrency(tetoViolation.valor_novo)}</strong> excede o saldo de <strong style={{ color: 'var(--red)' }}>{formatCurrency(tetoViolation.saldo_disponivel)}</strong>.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Teto', value: tetoViolation.teto },
                { label: 'Aprovado', value: tetoViolation.total_aprovado },
                { label: 'Saldo', value: tetoViolation.saldo_disponivel },
              ].map(k => (
                <div key={k.label} className="p-2.5 rounded-xl" style={{ background: 'var(--surface-3)' }}>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(k.value)}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setTetoViolation(null)} className="text-xs" style={{ color: 'var(--text-3)' }}>Fechar</button>
          </div>
        )}

        {itemLimiteViolation && (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(239,68,68,0.07)', border: '2px solid rgba(239,68,68,0.40)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: 'var(--red)' }} />
              <div>
                <p className="font-bold mb-0.5" style={{ color: 'var(--red)' }}>Limite do Item Excedido — {itemLimiteViolation.codigo}</p>
                <p className="text-sm" style={{ color: 'var(--text-2)' }}>{itemLimiteViolation.descricao}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Limite Contratado', value: itemLimiteViolation.limite },
                { label: 'Aprovado', value: itemLimiteViolation.aprovado },
                { label: 'Em Aprovação', value: itemLimiteViolation.emAprovacao },
                { label: 'Saldo Disponível', value: itemLimiteViolation.saldoDisponivel },
              ].map(k => (
                <div key={k.label} className="p-2.5 rounded-xl" style={{ background: 'var(--surface-3)' }}>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--text-3)' }}>{k.label}</p>
                  <p className="text-sm font-bold" style={{ color: 'var(--text-1)' }}>{formatCurrency(k.value)}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setItemLimiteViolation(null)} className="text-xs" style={{ color: 'var(--text-3)' }}>Fechar</button>
          </div>
        )}

        {/* ── Upload do Pedido de Compra FIP (auto-preenchimento) ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #8B5CF6, #A855F7)' }}>
                <FileText className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </span>
              Upload do Pedido de Compra FIP
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-3)' }}>
                (preenche os campos automaticamente)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {parseStatus !== 'done' ? (
              <div
                className="flex flex-col items-center gap-3 rounded-xl px-4 py-6 cursor-pointer transition-all text-center"
                style={{
                  background: 'var(--surface-3)',
                  border: `1.5px dashed ${parseStatus === 'error' ? 'rgba(239,68,68,0.50)' : 'var(--border)'}`,
                }}
                onClick={() => parseStatus !== 'loading' && parsePdfInputRef.current?.click()}
                onMouseEnter={e => { if (parseStatus !== 'loading') e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = parseStatus === 'error' ? 'rgba(239,68,68,0.50)' : 'var(--border)' }}
              >
                {parseStatus === 'loading' ? (
                  <>
                    <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>Lendo PDF...</p>
                    <p className="text-xs" style={{ color: 'var(--text-3)' }}>Extraindo dados do fornecedor</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" strokeWidth={1.5} style={{ color: parseStatus === 'error' ? 'var(--red)' : 'var(--text-3)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                        {parseStatus === 'error' ? 'Erro — tente outro PDF' : 'Selecionar PDF do Pedido de Compra'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: parseStatus === 'error' ? 'var(--red)' : 'var(--text-3)' }}>
                        {parseStatus === 'error' ? parseMsg : 'Preenche automaticamente: Nº Pedido, Razão Social, CNPJ, Telefone'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: 'rgba(16,185,129,0.07)', border: '1.5px solid rgba(16,185,129,0.30)' }}
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <span className="text-sm font-bold" style={{ color: '#10B981' }}>✓</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold" style={{ color: '#10B981' }}>{parseMsg}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-3)' }}>
                    {anexos.find(f => f.type === 'application/pdf')?.name}
                  </p>
                </div>
                <button
                  onClick={() => { setParseStatus('idle'); setParseMsg(''); setParsedFields(new Set()) }}
                  className="text-xs flex-shrink-0 px-2.5 py-1 rounded-lg transition-all"
                  style={{ color: 'var(--text-3)', border: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)' }}
                >
                  Trocar PDF
                </button>
              </div>
            )}
            <input
              ref={parsePdfInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handlePedidoPdfUpload(f)
                e.target.value = ''
              }}
            />
          </CardContent>
        </Card>

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
              {/* CNPJ — lookup first */}
              <div>
                <label className="block text-xs mb-1 font-medium flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  CNPJ *
                  {parsedFields.has('cnpj') && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>via PDF</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={fornCnpj}
                    onChange={e => handleCnpjChange(e.target.value)}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className={inputCls}
                    style={{
                      ...inputStyle,
                      paddingRight: '2.5rem',
                      borderColor: cnpjLookupStatus === 'found' ? '#10B981'
                        : cnpjLookupStatus === 'not_found' || cnpjLookupStatus === 'error' ? '#EF4444'
                        : cnpjLookupStatus === 'inactive' ? '#F59E0B'
                        : undefined,
                    }}
                    {...focusHandlers}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {cnpjLookupStatus === 'loading' && (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                    {cnpjLookupStatus === 'found' && <span className="text-[#10B981] text-sm font-bold">✓</span>}
                    {(cnpjLookupStatus === 'not_found' || cnpjLookupStatus === 'error') && <span className="text-[#EF4444] text-sm font-bold">✗</span>}
                    {cnpjLookupStatus === 'inactive' && <span className="text-[#F59E0B] text-sm font-bold">!</span>}
                  </div>
                </div>
                {cnpjLookupMsg && (
                  <p className="text-[11px] mt-1 font-medium" style={{
                    color: cnpjLookupStatus === 'found' ? '#10B981'
                      : cnpjLookupStatus === 'inactive' ? '#F59E0B'
                      : '#EF4444',
                  }}>
                    {cnpjLookupStatus === 'found' ? `✓ Empresa ativa — ${cnpjLookupMsg}` : cnpjLookupMsg}
                  </p>
                )}
              </div>

              {/* Razão Social — auto-filled from CNPJ lookup, editable */}
              <div>
                <label className="block text-xs mb-1 font-medium flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                  Razão Social *
                  {cnpjLookupStatus === 'found' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
                      preenchido automaticamente
                    </span>
                  )}
                  {parsedFields.has('razao') && cnpjLookupStatus !== 'found' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                      via PDF
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  value={fornRazaoSocial}
                  onChange={e => setFornRazaoSocial(e.target.value)}
                  placeholder={cnpjLookupStatus === 'loading' ? 'Consultando Receita Federal...' : 'Será preenchido automaticamente pelo CNPJ'}
                  readOnly={cnpjLookupStatus === 'found'}
                  className={inputCls}
                  style={{
                    ...inputStyle,
                    background: cnpjLookupStatus === 'found' ? 'var(--surface-3)' : inputStyle.background,
                    color: cnpjLookupStatus === 'found' ? 'var(--text-2)' : inputStyle.color,
                    cursor: cnpjLookupStatus === 'found' ? 'default' : undefined,
                  }}
                  {...(cnpjLookupStatus === 'found' ? {} : focusHandlers)}
                />
              </div>

              {/* Nº Pedido FIP */}
              <div>
                <label className="block text-xs mb-1 font-medium flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                  <Hash className="w-3 h-3" strokeWidth={1.5} /> Nº Pedido Interno FIP * <span className="ml-1 opacity-60">(será o número desta solicitação)</span>
                  {parsedFields.has('pedido') && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold ml-1" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>
                      via PDF
                    </span>
                  )}
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

              {/* Nome + Telefone do contato */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                    Nome do Contato *
                    {parsedFields.has('contato') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>via PDF</span>
                    )}
                  </label>
                  <input type="text" value={fornContatoNome} onChange={e => setFornContatoNome(e.target.value)}
                    placeholder="Nome do responsável" className={inputCls} style={inputStyle} {...focusHandlers} />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium flex items-center gap-1.5" style={{ color: 'var(--text-3)' }}>
                    Telefone *
                    {parsedFields.has('tel') && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6' }}>via PDF</span>
                    )}
                  </label>
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

        {/* ── Anexos do Pedido ── */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <span className="apple-icon" style={{ background: 'linear-gradient(135deg, #EF4444, #F97316)' }}>
                <Paperclip className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
              </span>
              Anexos do Pedido
              <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-3)' }}>(opcional · múltiplos arquivos)</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drop zone */}
            <div
              className="flex flex-col items-center gap-2 rounded-xl px-4 py-5 cursor-pointer transition-all text-center"
              style={{
                background: 'var(--surface-3)',
                border: '1.5px dashed var(--border)',
              }}
              onClick={() => pdfInputRef.current?.click()}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)' }}
              onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
              onDrop={e => {
                e.preventDefault()
                e.currentTarget.style.borderColor = 'var(--border)'
                const dropped = Array.from(e.dataTransfer.files)
                if (dropped.length > 0) setAnexos(prev => [...prev, ...dropped])
              }}
            >
              <Upload className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-2)' }}>
                  Clique ou arraste arquivos aqui
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                  PDF, imagens (JPG, PNG) — sem limite de quantidade
                </p>
              </div>
            </div>

            {/* Lista de arquivos selecionados */}
            {anexos.length > 0 && (
              <div className="space-y-2">
                {anexos.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: f.type.includes('pdf') ? 'rgba(239,68,68,0.12)' : 'rgba(59,130,246,0.12)' }}
                    >
                      <FileText
                        className="w-3.5 h-3.5"
                        strokeWidth={1.5}
                        style={{ color: f.type.includes('pdf') ? '#EF4444' : '#3B82F6' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--text-1)' }}>{f.name}</p>
                      <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                        {(f.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setAnexos(prev => prev.filter((_, idx) => idx !== i))}
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
                      style={{ color: 'var(--text-3)' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
                      title="Remover"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={2} />
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-right" style={{ color: 'var(--text-3)' }}>
                  {anexos.length} arquivo{anexos.length > 1 ? 's' : ''} selecionado{anexos.length > 1 ? 's' : ''}
                </p>
              </div>
            )}

            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                if (files.length > 0) setAnexos(prev => [...prev, ...files])
                e.target.value = ''
              }}
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
                  <input
                    type="number"
                    value={item.valor_total}
                    onChange={e => updateItem(i, 'valor_total', e.target.value)}
                    min="0" step="0.01" placeholder="0,00"
                    className={inputCls}
                    style={{ ...inputStyle, borderColor: itemViolations[i] ? 'rgba(239,68,68,0.60)' : undefined }}
                    {...focusHandlers}
                  />
                  {itemViolations[i] && (() => {
                    const v = itemViolations[i]
                    return (
                      <div className="mt-2 rounded-xl p-3 flex items-start gap-2" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)' }}>
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: '#EF4444' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold mb-1" style={{ color: '#EF4444' }}>
                            LIMITE EXCEDIDO — {v.codigo}
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]" style={{ color: 'var(--text-2)' }}>
                            <span>Aprovado: <strong>{formatCurrency(v.aprovado)}</strong></span>
                            <span>Em Aprovação: <strong>{formatCurrency(v.emAprovacao)}</strong></span>
                            <span style={{ color: v.saldo <= 0 ? '#EF4444' : '#10B981' }}>
                              Saldo Disponível: <strong>{formatCurrency(v.saldo)}</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
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
          {Object.keys(itemViolations).length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.30)' }}>
              <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2} />
              {Object.keys(itemViolations).length} item(s) com limite excedido
            </div>
          )}
          <Button
            onClick={salvar}
            disabled={saving || Object.keys(itemViolations).length > 0}
            className="gap-2 text-white"
            style={{ background: Object.keys(itemViolations).length > 0 ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
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
