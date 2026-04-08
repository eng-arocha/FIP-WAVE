'use client'

import { use, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowLeft, Plus, Package, Save, AlertTriangle,
  Building2, X, Hash, Upload, FileText, TrendingUp, Paperclip, CheckCircle2, Search,
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
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  // Fixo (10 dígitos): (XX) XXXX-XXXX  |  Móvel (11 dígitos): (XX) XXXXX-XXXX
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
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
  _nv1: string   // primeira parte do código (ex: "4")
  _nv2: string   // segunda parte (ex: "3")
  _nv3: string   // terceira parte (ex: "1") → código completo = "4.3.1"
}

const GROUP_SIZE = 5
const EMPTY_ITEM = (): ItemForm => ({ tarefa_id: '', descricao: '', local: '', valor_total: '', _nv1: '', _nv2: '', _nv3: '' })

// ── Combobox compacto de disciplina ───────────────────────────────────────
function ItemCombobox({ tarefas, value, onChange }: {
  tarefas: Tarefa[]
  value: string
  onChange: (tarefaId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = tarefas.find(t => t.id === value)

  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return tarefas
    return tarefas.filter(t => t.codigo.toLowerCase().includes(q) || t.nome.toLowerCase().includes(q))
  }, [tarefas, query])

  return (
    <div ref={ref} className="relative">
      <div
        className="h-7 w-full rounded-lg flex items-center gap-1.5 px-2 cursor-text"
        style={{ background: 'var(--surface-2)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, boxShadow: open ? '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' : 'none' }}
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        <Search className="w-3 h-3 flex-shrink-0" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
        {selected && !open ? (
          <span className="flex-1 text-xs truncate min-w-0" style={{ color: 'var(--text-1)' }}>
            <span className="font-bold" style={{ color: 'var(--accent)' }}>{selected.codigo}</span>
            {' '}<span style={{ color: 'var(--text-2)' }}>{selected.nome.substring(0, 50)}</span>
          </span>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? `${selected.codigo}` : 'Buscar código ou nome…'}
            className="flex-1 text-xs outline-none bg-transparent min-w-0"
            style={{ color: 'var(--text-1)' }}
          />
        )}
        {value && (
          <button
            onClick={e => { e.stopPropagation(); onChange(''); setQuery('') }}
            className="flex-shrink-0 rounded-full"
            style={{ color: 'var(--text-3)' }}
          >
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        )}
      </div>

      {open && (
        <div
          className="absolute z-50 left-0 right-0 top-full mt-0.5 rounded-xl overflow-auto"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-center" style={{ color: 'var(--text-3)' }}>Nenhum item encontrado</div>
          ) : filtered.map(t => {
            const saldo = t.valor_material - t.valor_aprovado - (t.valor_em_aprovacao || 0)
            return (
              <button
                key={t.id}
                onClick={() => { onChange(t.id); setQuery(''); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}
              >
                <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--accent)', color: 'white' }}>
                  {t.codigo}
                </span>
                <span className="flex-1 truncate" style={{ color: 'var(--text-1)' }}>{t.nome.substring(0, 55)}</span>
                <span className="flex-shrink-0 font-semibold" style={{ color: saldo <= 0 ? 'var(--red)' : 'var(--green)' }}>
                  {formatCurrency(saldo)}
                </span>
              </button>
            )
          })}
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

  async function lookupCnpj(maskedValue: string, fallbackRazao = '') {
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
        // Preserva razão social extraída do PDF se houver
        setFornRazaoSocial(fallbackRazao)
        return
      }
      if (!res.ok) {
        setCnpjLookupStatus('error')
        setCnpjLookupMsg(data.error || 'Erro ao consultar Receita Federal')
        // Preserva razão social extraída do PDF se houver
        if (fallbackRazao) setFornRazaoSocial(fallbackRazao)
        return
      }
      if (!data.ativa) {
        setCnpjLookupStatus('inactive')
        setCnpjLookupMsg(`Empresa com situação: ${data.situacao_cadastral}`)
        setFornRazaoSocial(data.razao_social || fallbackRazao)
        return
      }
      setCnpjLookupStatus('found')
      setCnpjLookupMsg(`${data.municipio}/${data.uf}`)
      setFornRazaoSocial(data.razao_social || fallbackRazao)
    } catch {
      setCnpjLookupStatus('error')
      setCnpjLookupMsg('Falha na conexão com Receita Federal')
      // Preserva razão social extraída do PDF se houver
      if (fallbackRazao) setFornRazaoSocial(fallbackRazao)
    }
  }

  function handleCnpjChange(raw: string, fallbackRazao = '') {
    const masked = maskCnpj(raw)
    setFornCnpj(masked)
    setCnpjLookupStatus('idle')
    setCnpjLookupMsg('')
    setFornRazaoSocial(fallbackRazao)
    const digits = masked.replace(/\D/g, '')
    if (digits.length === 14) lookupCnpj(masked, fallbackRazao)
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
      if (data.razao_social) filled.add('razao')
      if (data.cnpj) {
        // Passa razão social como fallback — se Receita Federal falhar, usa o valor do PDF
        handleCnpjChange(data.cnpj, data.razao_social || '')
        filled.add('cnpj')
      } else if (data.razao_social) {
        setFornRazaoSocial(data.razao_social)
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

  const [itens, setItens] = useState<ItemForm[]>(() => Array.from({ length: GROUP_SIZE }, EMPTY_ITEM))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [tetoViolation, setTetoViolation] = useState<any>(null)
  const [itemLimiteViolation, setItemLimiteViolation] = useState<any>(null)

  // Verifica inline se algum item excede o teto de material
  const anyViolation = useMemo(() => itens.some(item => {
    if (!item.tarefa_id) return false
    const t = tarefas.find(x => x.id === item.tarefa_id)
    const mat = t?.valor_material ?? 0
    const val = parseFloat(item.valor_total) || 0
    return mat > 0 && val > mat
  }), [itens, tarefas])

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

  // Adiciona mais GROUP_SIZE linhas vazias
  function addGroup() {
    setItens(prev => [...prev, ...Array.from({ length: GROUP_SIZE }, EMPTY_ITEM)])
  }

  // Limpa uma linha (não remove, mantém a grade)
  function clearItem(i: number) {
    setItens(prev => prev.map((item, idx) => idx === i ? EMPTY_ITEM() : item))
  }

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  // Chamado quando nv1/nv2/nv3 muda — tenta auto-selecionar o detalhamento
  function handleNivelChange(i: number, nv: '_nv1' | '_nv2' | '_nv3', val: string, nextInputId?: string) {
    setItens(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const next = { ...item, [nv]: val }
      const nv1 = nv === '_nv1' ? val : next._nv1
      const nv2 = nv === '_nv2' ? val : next._nv2
      const nv3 = nv === '_nv3' ? val : next._nv3
      if (nv1 && nv2 && nv3) {
        const fullCode = `${nv1}.${nv2}.${nv3}`
        const t = tarefas.find(x => x.codigo === fullCode)
        if (t) {
          return {
            ...next,
            tarefa_id: t.id,
            descricao: next.descricao || t.nome.substring(0, 80),
            local: next.local || t.locais[0] || '',
            valor_total: next.valor_total || (t.valor_material > 0 ? String(t.valor_material) : ''),
          }
        }
      }
      return { ...next, tarefa_id: '' }
    }))
    if (nextInputId) setTimeout(() => (document.getElementById(nextInputId) as HTMLInputElement | null)?.focus(), 0)
  }

  // Seleção via combobox — preenche NV1/NV2/NV3 e demais campos
  function onTarefaChange(i: number, tarefaId: string) {
    const t = tarefas.find(x => x.id === tarefaId)
    const parts = (t?.codigo || '').split('.')
    setItens(prev => prev.map((item, idx) =>
      idx !== i ? item : {
        ...item,
        tarefa_id: tarefaId,
        _nv1: parts[0] || '',
        _nv2: parts[1] || '',
        _nv3: parts[2] || '',
        descricao: t?.nome?.substring(0, 80) || item.descricao,
        local: item.local || t?.locais?.[0] || '',
        valor_total: item.valor_total || (t && t.valor_material > 0 ? String(t.valor_material) : ''),
      }
    ))
  }

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor_total) || 0), 0)

  // Agrupa itens em blocos de GROUP_SIZE para exibição
  const grupos = useMemo(() => {
    const g: { start: number; items: ItemForm[] }[] = []
    for (let i = 0; i < itens.length; i += GROUP_SIZE) {
      g.push({ start: i, items: itens.slice(i, i + GROUP_SIZE) })
    }
    return g
  }, [itens])

  async function salvar() {
    setErro('')
    if (!fornRazaoSocial.trim()) { setErro('Informe a Razão Social do fornecedor.'); return }
    if (!fornCnpj.trim()) { setErro('Informe o CNPJ do fornecedor.'); return }
    if (!fornContatoNome.trim()) { setErro('Informe o Nome do contato.'); return }
    if (!fornContatoTel.trim()) { setErro('Informe o Telefone do contato.'); return }
    if (!numeroPedidoFip.trim() || isNaN(parseInt(numeroPedidoFip, 10))) {
      setErro('Informe o Nº Pedido Interno FIP (número inteiro).'); return
    }
    // Somente linhas preenchidas contam
    const filledItens = itens.filter(it => it.tarefa_id && parseFloat(it.valor_total) > 0)
    if (filledItens.length === 0) { setErro('Adicione pelo menos um item com disciplina e valor.'); return }
    for (const it of filledItens) {
      if (!it.local) { setErro('Informe o local para todos os itens preenchidos.'); return }
    }
    if (anyViolation) {
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
        itens: filledItens.map(it => {
          const t = tarefas.find(x => x.id === it.tarefa_id)
          return {
            tarefa_id: t?.tarefa_id || it.tarefa_id, // FK real para tarefas
            detalhamento_id: it.tarefa_id,            // ID do detalhamento (nível 3)
            descricao: it.descricao || t?.nome?.substring(0, 80) || '',
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Itens da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            {/* Cabeçalho das colunas */}
            <div
              className="hidden sm:grid mb-1 px-1"
              style={{ gridTemplateColumns: '26px 46px 40px 46px 1fr 108px 88px 24px', gap: '4px' }}
            >
              {['#','NV1','NV2','NV3','Disciplina / Descrição','Local','Valor (R$)',''].map((h, idx) => (
                <span key={idx} className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: 'var(--text-3)' }}>{h}</span>
              ))}
            </div>

            {/* Grupos de GROUP_SIZE linhas */}
            {grupos.map((grupo, gi) => (
              <div
                key={gi}
                className="rounded-xl mb-3 overflow-hidden"
                style={{ border: '1px solid var(--border)' }}
              >
                {grupo.items.map((item, li) => {
                  const gIdx = grupo.start + li
                  const isValid = !!item.tarefa_id
                  const hasCode = !!(item._nv1 && item._nv2 && item._nv3)
                  // Inline violation check — direto, sem depender de useMemo externo
                  const rowTarefa = isValid ? tarefas.find(x => x.id === item.tarefa_id) : undefined
                  const tetoMat = rowTarefa?.valor_material ?? 0
                  const valorAtualNum = parseFloat(item.valor_total) || 0
                  const excedeTetoMat = tetoMat > 0 && valorAtualNum > tetoMat
                  const nvBorder = (active?: boolean) => ({
                    background: 'var(--surface-2)',
                    border: `1px solid ${active ? 'var(--accent)' : hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)'}`,
                    color: 'var(--text-1)',
                    boxShadow: active ? '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' : 'none',
                  })

                  return (
                    <div key={gIdx}>
                      {/* Linha compacta (desktop) */}
                      <div
                        className="hidden sm:grid items-center px-1"
                        style={{
                          gridTemplateColumns: '26px 46px 40px 46px 1fr 108px 88px 24px',
                          gap: '4px',
                          paddingTop: 6, paddingBottom: isValid ? 18 : 6,
                          background: gIdx % 2 === 0 ? 'var(--surface-3)' : 'var(--surface-2)',
                        }}
                      >
                        {/* # */}
                        <span className="text-center text-[11px] font-mono" style={{ color: isValid ? 'var(--green)' : 'var(--text-3)' }}>
                          {isValid ? <CheckCircle2 className="w-3.5 h-3.5 inline" strokeWidth={2} style={{ color: 'var(--green)' }} /> : gIdx + 1}
                        </span>

                        {/* NV1 */}
                        <input
                          id={`nv1-${gIdx}`}
                          type="text"
                          inputMode="numeric"
                          value={item._nv1}
                          placeholder="1"
                          maxLength={3}
                          onChange={e => handleNivelChange(gIdx, '_nv1', e.target.value)}
                          onKeyDown={e => { if (['.', ',', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); (document.getElementById(`nv2-${gIdx}`) as HTMLInputElement | null)?.focus() } }}
                          className="h-7 rounded-lg text-center text-xs outline-none w-full"
                          style={nvBorder()}
                          onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                          onBlur={e => Object.assign(e.currentTarget.style, { borderColor: hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)', boxShadow: 'none' })}
                        />

                        {/* NV2 */}
                        <input
                          id={`nv2-${gIdx}`}
                          type="text"
                          inputMode="numeric"
                          value={item._nv2}
                          placeholder="1"
                          maxLength={3}
                          onChange={e => handleNivelChange(gIdx, '_nv2', e.target.value)}
                          onKeyDown={e => { if (['.', ',', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); (document.getElementById(`nv3-${gIdx}`) as HTMLInputElement | null)?.focus() } }}
                          className="h-7 rounded-lg text-center text-xs outline-none w-full"
                          style={nvBorder()}
                          onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                          onBlur={e => Object.assign(e.currentTarget.style, { borderColor: hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)', boxShadow: 'none' })}
                        />

                        {/* NV3 */}
                        <input
                          id={`nv3-${gIdx}`}
                          type="text"
                          inputMode="numeric"
                          value={item._nv3}
                          placeholder="1"
                          maxLength={3}
                          onChange={e => handleNivelChange(gIdx, '_nv3', e.target.value, item._nv1 && item._nv2 && e.target.value ? `desc-${gIdx}` : undefined)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (document.getElementById(`nv1-${gIdx + 1}`) as HTMLInputElement | null)?.focus() } }}
                          className="h-7 rounded-lg text-center text-xs outline-none w-full"
                          style={nvBorder()}
                          onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                          onBlur={e => Object.assign(e.currentTarget.style, { borderColor: hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)', boxShadow: 'none' })}
                        />

                        {/* Combobox de disciplina (busca + NV1/NV2/NV3 sincronizados) */}
                        <ItemCombobox
                          tarefas={tarefas}
                          value={item.tarefa_id}
                          onChange={(tid) => onTarefaChange(gIdx, tid)}
                        />

                        {/* Local */}
                        <input
                          type="text"
                          value={item.local}
                          placeholder="TORRE"
                          onChange={e => updateItem(gIdx, 'local', e.target.value)}
                          className="h-7 rounded-lg px-2 text-xs outline-none w-full"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                          onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                          onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', boxShadow: 'none' })}
                        />

                        {/* Valor + teto de material */}
                        <div className="relative">
                          <input
                            type="number"
                            value={item.valor_total}
                            placeholder="0,00"
                            min="0" step="0.01"
                            onChange={e => updateItem(gIdx, 'valor_total', e.target.value)}
                            className="h-7 rounded-lg px-2 text-xs text-right outline-none w-full"
                            style={{ background: 'var(--surface-2)', border: `1px solid ${excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)'}`, color: 'var(--text-1)' }}
                            title={tetoMat > 0 ? `Teto material: ${formatCurrency(tetoMat)}` : ''}
                            onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                            onBlur={e => Object.assign(e.currentTarget.style, { borderColor: excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)', boxShadow: 'none' })}
                          />
                          {tetoMat > 0 && (
                            <div className="absolute left-0 right-0 -bottom-3.5 text-center text-[9px] font-medium truncate" style={{ color: excedeTetoMat ? '#EF4444' : 'var(--text-3)' }}>
                              teto {formatCurrency(tetoMat)}
                            </div>
                          )}
                        </div>

                        {/* Limpar linha */}
                        <button
                          onClick={() => clearItem(gIdx)}
                          className="h-7 w-6 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: 'var(--text-3)' }}
                          title="Limpar linha"
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}
                        >
                          <X className="w-3 h-3" strokeWidth={2} />
                        </button>
                      </div>

                      {/* Versão mobile — stacked */}
                      <div
                        className="sm:hidden p-3 space-y-2"
                        style={{ background: gIdx % 2 === 0 ? 'var(--surface-3)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Item {gIdx + 1}</span>
                          {isValid && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} style={{ color: 'var(--green)' }} />}
                          <button onClick={() => clearItem(gIdx)} style={{ color: 'var(--text-3)' }}>
                            <X className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {(['_nv1','_nv2','_nv3'] as const).map((nv, ni) => (
                            <input key={nv} type="text" inputMode="numeric" value={item[nv]} placeholder={`NV${ni+1}`} maxLength={3}
                              onChange={e => handleNivelChange(gIdx, nv, e.target.value)}
                              className="flex-1 h-8 rounded-lg text-center text-xs outline-none"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                          ))}
                        </div>
                        <input type="text" value={item.descricao} placeholder="Descrição" onChange={e => updateItem(gIdx, 'descricao', e.target.value)}
                          className="w-full h-8 rounded-lg px-2 text-xs outline-none"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                        <div className="flex gap-2">
                          <input type="text" value={item.local} placeholder="Local" onChange={e => updateItem(gIdx, 'local', e.target.value)}
                            className="flex-1 h-8 rounded-lg px-2 text-xs outline-none"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                          <input type="number" value={item.valor_total} placeholder="Valor" min="0" step="0.01" onChange={e => updateItem(gIdx, 'valor_total', e.target.value)}
                            className="w-28 h-8 rounded-lg px-2 text-xs text-right outline-none"
                            style={{ background: 'var(--surface-2)', border: `1px solid ${excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)'}`, color: 'var(--text-1)' }} />
                        </div>
                      </div>

                      {/* Alerta de teto excedido */}
                      {excedeTetoMat && rowTarefa && (
                        <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] flex-wrap" style={{ background: 'rgba(239,68,68,0.07)', borderTop: '1px solid rgba(239,68,68,0.25)' }}>
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" strokeWidth={2} style={{ color: '#EF4444' }} />
                          <span style={{ color: '#EF4444', fontWeight: 700 }}>TETO EXCEDIDO — {rowTarefa.codigo}</span>
                          <span style={{ color: 'var(--text-2)' }}>Teto: <strong>{formatCurrency(tetoMat)}</strong></span>
                          <span style={{ color: 'var(--text-2)' }}>Solicitado: <strong>{formatCurrency(valorAtualNum)}</strong></span>
                          <span style={{ color: '#EF4444' }}>Excesso: <strong>+{formatCurrency(valorAtualNum - tetoMat)}</strong></span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Rodapé do grupo — botão apenas no último grupo */}
                {gi === grupos.length - 1 && (
                  <div className="flex justify-end px-3 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <Button onClick={addGroup} size="sm" variant="ghost" className="gap-1 text-xs" style={{ color: 'var(--accent)' }}>
                      <Plus className="w-3.5 h-3.5" strokeWidth={1.5} /> + 5 linhas
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Total sticky ── */}
        <div
          className="sticky bottom-0 z-10 rounded-xl flex items-center justify-between px-5 py-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', boxShadow: '0 -4px 24px rgba(0,0,0,0.10)' }}
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Total da Solicitação</span>
            {anyViolation && (
              <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                teto excedido
              </span>
            )}
          </div>
          <span className="text-xl font-black" style={{ color: total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{formatCurrency(total)}</span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" style={{ color: 'var(--text-3)' }}>Cancelar</Button>
          </Link>
          <Button
            onClick={salvar}
            disabled={saving || anyViolation}
            className="gap-2 text-white"
            style={{ background: anyViolation ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
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
