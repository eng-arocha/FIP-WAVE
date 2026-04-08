'use client'

import { use, useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import {
  ArrowLeft, Plus, Package, Save, AlertTriangle,
  Building2, X, Hash, TrendingUp, CheckCircle2, Search,
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
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Tarefa {
  id: string
  tarefa_id: string
  codigo: string
  nome: string
  valor_material: number
  valor_servico: number
  valor_total: number
  valor_aprovado: number
  valor_em_aprovacao: number
  locais: string[]
}

interface ItemForm {
  tarefa_id: string
  descricao: string
  local: string
  valor_total: string
  _nv1: string
  _nv2: string
  _nv3: string
}

const GROUP_SIZE = 5
const EMPTY_ITEM = (): ItemForm => ({ tarefa_id: '', descricao: '', local: '', valor_total: '', _nv1: '', _nv2: '', _nv3: '' })

// ── Combobox ──────────────────────────────────────────────────────────────
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
          <span className="flex-1 text-xs truncate min-w-0">
            <span className="font-bold" style={{ color: 'var(--accent)' }}>{selected.codigo}</span>
            {' '}<span style={{ color: 'var(--text-2)' }}>{selected.nome.substring(0, 50)}</span>
          </span>
        ) : (
          <input ref={inputRef} type="text" value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? selected.codigo : 'Buscar código ou nome…'}
            className="flex-1 text-xs outline-none bg-transparent min-w-0"
            style={{ color: 'var(--text-1)' }}
          />
        )}
        {value && (
          <button onClick={e => { e.stopPropagation(); onChange(''); setQuery('') }} className="flex-shrink-0" style={{ color: 'var(--text-3)' }}>
            <X className="w-3 h-3" strokeWidth={2} />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 rounded-xl overflow-auto"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', maxHeight: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-center" style={{ color: 'var(--text-3)' }}>Nenhum item encontrado</div>
          ) : filtered.map(t => {
            const saldo = t.valor_material - t.valor_aprovado - (t.valor_em_aprovacao || 0)
            return (
              <button key={t.id} onClick={() => { onChange(t.id); setQuery(''); setOpen(false) }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--accent)', color: 'white' }}>{t.codigo}</span>
                <span className="flex-1 truncate" style={{ color: 'var(--text-1)' }}>{t.nome.substring(0, 55)}</span>
                <span className="flex-shrink-0 font-semibold" style={{ color: saldo <= 0 ? 'var(--red)' : 'var(--green)' }}>{formatCurrency(saldo)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Página de Edição ──────────────────────────────────────────────────────
export default function EditarSolicitacaoPage({ params }: { params: Promise<{ id: string; solId: string }> }) {
  const { id, solId } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [solNumero, setSolNumero] = useState<number | null>(null)

  // Dados do Fornecedor
  const [fornRazaoSocial, setFornRazaoSocial] = useState('')
  const [fornCnpj, setFornCnpj] = useState('')
  const [fornContatoNome, setFornContatoNome] = useState('')
  const [fornContatoTel, setFornContatoTel] = useState('')
  const [numeroPedidoFip, setNumeroPedidoFip] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [itens, setItens] = useState<ItemForm[]>(() => Array.from({ length: GROUP_SIZE }, EMPTY_ITEM))
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  // Carrega tarefas + solicitação existente
  useEffect(() => {
    Promise.all([
      fetch(`/api/contratos/${id}/fat-direto/tarefas`).then(r => r.json()),
      fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}`).then(r => r.json()),
    ]).then(([tarefasData, sol]) => {
      const tList: Tarefa[] = Array.isArray(tarefasData) ? tarefasData : []
      setTarefas(tList)
      setSolNumero(sol.numero)

      // Pré-popula fornecedor
      setFornRazaoSocial(sol.fornecedor_razao_social || '')
      const cnpjRaw = sol.fornecedor_cnpj || ''
      setFornCnpj(cnpjRaw.length === 14 ? maskCnpj(cnpjRaw) : cnpjRaw)
      setNumeroPedidoFip(sol.numero_pedido_fip != null ? String(sol.numero_pedido_fip) : '')
      setObservacoes(sol.observacoes || '')

      // Pré-popula contato
      const contato = sol.fornecedor_contato || ''
      if (contato.includes(' / ')) {
        const [nome, tel] = contato.split(' / ')
        setFornContatoNome(nome || '')
        setFornContatoTel(tel || '')
      } else {
        setFornContatoNome(sol.fornecedor_contato_nome || '')
        setFornContatoTel(sol.fornecedor_contato_telefone ? maskTelefone(String(sol.fornecedor_contato_telefone)) : '')
      }

      // Pré-popula itens: encontra o detalhamento pelo código
      if (sol.itens && sol.itens.length > 0) {
        const preenchidos: ItemForm[] = sol.itens.map((it: any) => {
          const det = tList.find(t => t.tarefa_id === it.tarefa?.id || t.id === it.detalhamento_id)
          if (det) {
            const parts = det.codigo.split('.')
            return {
              tarefa_id: det.id,
              descricao: it.descricao || det.nome,
              local: it.local || '',
              valor_total: String(it.valor_total || ''),
              _nv1: parts[0] || '',
              _nv2: parts[1] || '',
              _nv3: parts[2] || '',
            }
          }
          // Fallback: sem detalhamento encontrado
          const tarCode = it.tarefa?.codigo || ''
          const parts = tarCode.split('.')
          return {
            tarefa_id: it.detalhamento_id || '',
            descricao: it.descricao || '',
            local: it.local || '',
            valor_total: String(it.valor_total || ''),
            _nv1: parts[0] || '',
            _nv2: parts[1] || '',
            _nv3: parts[2] || '',
          }
        })
        // Completa com linhas vazias até GROUP_SIZE múltiplo
        const total = Math.max(GROUP_SIZE, Math.ceil(preenchidos.length / GROUP_SIZE) * GROUP_SIZE)
        while (preenchidos.length < total) preenchidos.push(EMPTY_ITEM())
        setItens(preenchidos)
      }

      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id, solId])

  const anyViolation = useMemo(() => itens.some(item => {
    if (!item.tarefa_id) return false
    const t = tarefas.find(x => x.id === item.tarefa_id)
    const mat = t?.valor_material ?? 0
    const val = parseFloat(item.valor_total) || 0
    return mat > 0 && val > mat
  }), [itens, tarefas])

  const grupos = useMemo(() => {
    const g: { start: number; items: ItemForm[] }[] = []
    for (let i = 0; i < itens.length; i += GROUP_SIZE) {
      g.push({ start: i, items: itens.slice(i, i + GROUP_SIZE) })
    }
    return g
  }, [itens])

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor_total) || 0), 0)

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function handleNivelChange(i: number, nv: '_nv1' | '_nv2' | '_nv3', val: string) {
    setItens(prev => prev.map((item, idx) => {
      if (idx !== i) return item
      const next = { ...item, [nv]: val }
      const nv1 = nv === '_nv1' ? val : next._nv1
      const nv2 = nv === '_nv2' ? val : next._nv2
      const nv3 = nv === '_nv3' ? val : next._nv3
      if (nv1 && nv2 && nv3) {
        const t = tarefas.find(x => x.codigo === `${nv1}.${nv2}.${nv3}`)
        if (t) return { ...next, tarefa_id: t.id, descricao: next.descricao || t.nome.substring(0, 80), local: next.local || t.locais[0] || '', valor_total: next.valor_total || (t.valor_material > 0 ? String(t.valor_material) : '') }
      }
      return { ...next, tarefa_id: '' }
    }))
  }

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

  function addGroup() {
    setItens(prev => [...prev, ...Array.from({ length: GROUP_SIZE }, EMPTY_ITEM)])
  }

  function clearItem(i: number) {
    setItens(prev => prev.map((item, idx) => idx === i ? EMPTY_ITEM() : item))
  }

  async function salvar() {
    setErro('')
    if (!fornRazaoSocial.trim()) { setErro('Informe a Razão Social do fornecedor.'); return }
    if (!fornCnpj.trim()) { setErro('Informe o CNPJ do fornecedor.'); return }
    if (!numeroPedidoFip.trim() || isNaN(parseInt(numeroPedidoFip, 10))) { setErro('Informe o Nº Pedido Interno FIP.'); return }
    const filledItens = itens.filter(it => it.tarefa_id && parseFloat(it.valor_total) > 0)
    if (filledItens.length === 0) { setErro('Adicione pelo menos um item com disciplina e valor.'); return }
    for (const it of filledItens) {
      if (!it.local) { setErro('Informe o local para todos os itens preenchidos.'); return }
    }
    if (anyViolation) { setErro('Corrija os limites por disciplina antes de salvar.'); return }

    setSaving(true)
    try {
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
            tarefa_id: t?.tarefa_id || it.tarefa_id,
            detalhamento_id: it.tarefa_id,
            descricao: it.descricao || t?.nome?.substring(0, 80) || '',
            local: it.local,
            valor_total: parseFloat(it.valor_total) || 0,
          }
        }),
      }
      const res = await fetch(`/api/contratos/${id}/fat-direto/solicitacoes/${solId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setErro(data.error || 'Erro ao salvar'); setSaving(false); return }
      router.push(`/contratos/${id}/fat-direto/${solId}`)
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

  if (loading) return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title="Editar Solicitação" />
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-3)' }}>Carregando...</div>
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'var(--background)' }}>
      <Topbar title={`Editar SOL-${String(solNumero).padStart(3, '0')}`} />

      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link href={`/contratos/${id}/fat-direto/${solId}`}>
            <Button variant="ghost" size="sm" className="gap-1 px-2 sm:px-3" style={{ color: 'var(--text-3)' }}>
              <ArrowLeft className="w-4 h-4" strokeWidth={1.5} /> <span className="hidden sm:inline">Voltar</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-base sm:text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-1)' }}>
              <Package className="w-5 h-5" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
              Editar Solicitação SOL-{String(solNumero).padStart(3, '0')}
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-3)' }}>Corrija os dados e salve para atualizar</p>
          </div>
        </div>

        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--red)' }}>
            {erro}
          </div>
        )}

        {/* Dados do Fornecedor */}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>CNPJ *</label>
                <input type="text" value={fornCnpj} onChange={e => setFornCnpj(maskCnpj(e.target.value))}
                  placeholder="00.000.000/0001-00" maxLength={18}
                  className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Razão Social *</label>
                <input type="text" value={fornRazaoSocial} onChange={e => setFornRazaoSocial(e.target.value)}
                  placeholder="Razão Social do Fornecedor"
                  className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1 font-medium flex items-center gap-1" style={{ color: 'var(--text-3)' }}>
                  <Hash className="w-3 h-3" strokeWidth={1.5} /> Nº Pedido FIP *
                </label>
                <input type="number" value={numeroPedidoFip} onChange={e => setNumeroPedidoFip(e.target.value)}
                  placeholder="Ex: 1023" min="1"
                  className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Nome do Contato</label>
                <input type="text" value={fornContatoNome} onChange={e => setFornContatoNome(e.target.value)}
                  placeholder="Nome do responsável"
                  className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-3)' }}>Telefone</label>
                <input type="tel" value={fornContatoTel} onChange={e => setFornContatoTel(maskTelefone(e.target.value))}
                  placeholder="(11) 99999-9999" maxLength={15}
                  className={inputCls} style={inputStyle} {...focusHandlers} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              placeholder="Justificativa ou observações..." rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-all"
              style={inputStyle} {...focusHandlers} />
          </CardContent>
        </Card>

        {/* Itens */}
        <Card style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm" style={{ color: 'var(--text-1)' }}>Itens da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="hidden sm:grid mb-1 px-1"
              style={{ gridTemplateColumns: '26px 46px 40px 46px 1fr 108px 88px 24px', gap: '4px' }}>
              {['#','NV1','NV2','NV3','Disciplina / Descrição','Local','Valor (R$)',''].map((h, idx) => (
                <span key={idx} className="text-[10px] font-semibold uppercase tracking-wide text-center" style={{ color: 'var(--text-3)' }}>{h}</span>
              ))}
            </div>

            {grupos.map((grupo, gi) => (
              <div key={gi} className="rounded-xl mb-3 overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {grupo.items.map((item, li) => {
                  const gIdx = grupo.start + li
                  const isValid = !!item.tarefa_id
                  const hasCode = !!(item._nv1 && item._nv2 && item._nv3)
                  const rowTarefa = isValid ? tarefas.find(x => x.id === item.tarefa_id) : undefined
                  const tetoMat = rowTarefa?.valor_material ?? 0
                  const valorAtualNum = parseFloat(item.valor_total) || 0
                  const excedeTetoMat = tetoMat > 0 && valorAtualNum > tetoMat
                  const nvBorder = () => ({
                    background: 'var(--surface-2)',
                    border: `1px solid ${hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)'}`,
                    color: 'var(--text-1)',
                  })

                  return (
                    <div key={gIdx}>
                      <div className="hidden sm:grid items-center px-1"
                        style={{ gridTemplateColumns: '26px 46px 40px 46px 1fr 108px 88px 24px', gap: '4px', paddingTop: 6, paddingBottom: isValid ? 18 : 6, background: gIdx % 2 === 0 ? 'var(--surface-3)' : 'var(--surface-2)' }}>

                        <span className="text-center text-[11px] font-mono" style={{ color: isValid ? 'var(--green)' : 'var(--text-3)' }}>
                          {isValid ? <CheckCircle2 className="w-3.5 h-3.5 inline" strokeWidth={2} style={{ color: 'var(--green)' }} /> : gIdx + 1}
                        </span>

                        {(['_nv1','_nv2','_nv3'] as const).map((nv, ni) => (
                          <input key={nv}
                            id={`nv${ni+1}-${gIdx}`}
                            type="text" inputMode="numeric" value={item[nv]} placeholder={String(ni+1)} maxLength={3}
                            onChange={e => handleNivelChange(gIdx, nv, e.target.value)}
                            onKeyDown={e => {
                              if (['.', ',', ' ', 'Enter'].includes(e.key)) {
                                e.preventDefault()
                                const nextId = ni < 2 ? `nv${ni+2}-${gIdx}` : `nv1-${gIdx+1}`
                                ;(document.getElementById(nextId) as HTMLInputElement | null)?.focus()
                              }
                            }}
                            className="h-7 rounded-lg text-center text-xs outline-none w-full"
                            style={nvBorder()}
                            onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                            onBlur={e => Object.assign(e.currentTarget.style, { borderColor: hasCode && !isValid ? 'rgba(239,68,68,0.55)' : 'var(--border)', boxShadow: 'none' })}
                          />
                        ))}

                        <ItemCombobox tarefas={tarefas} value={item.tarefa_id} onChange={(tid) => onTarefaChange(gIdx, tid)} />

                        <input type="text" value={item.local} placeholder="TORRE"
                          onChange={e => updateItem(gIdx, 'local', e.target.value)}
                          className="h-7 rounded-lg px-2 text-xs outline-none w-full"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                          onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                          onBlur={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--border)', boxShadow: 'none' })} />

                        <div className="relative">
                          <input type="number" value={item.valor_total} placeholder="0,00" min="0" step="0.01"
                            onChange={e => updateItem(gIdx, 'valor_total', e.target.value)}
                            className="h-7 rounded-lg px-2 text-xs text-right outline-none w-full"
                            style={{ background: 'var(--surface-2)', border: `1px solid ${excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)'}`, color: 'var(--text-1)' }}
                            onFocus={e => Object.assign(e.currentTarget.style, { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)' })}
                            onBlur={e => Object.assign(e.currentTarget.style, { borderColor: excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)', boxShadow: 'none' })} />
                          {tetoMat > 0 && (
                            <div className="absolute left-0 right-0 -bottom-3.5 text-center text-[9px] font-medium truncate"
                              style={{ color: excedeTetoMat ? '#EF4444' : 'var(--text-3)' }}>
                              teto {formatCurrency(tetoMat)}
                            </div>
                          )}
                        </div>

                        <button onClick={() => clearItem(gIdx)}
                          className="h-7 w-6 flex items-center justify-center rounded-lg transition-colors"
                          style={{ color: 'var(--text-3)' }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = '' }}>
                          <X className="w-3 h-3" strokeWidth={2} />
                        </button>
                      </div>

                      {/* Mobile */}
                      <div className="sm:hidden p-3 space-y-2" style={{ background: gIdx % 2 === 0 ? 'var(--surface-3)' : 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--text-3)' }}>Item {gIdx + 1}</span>
                          {isValid && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} style={{ color: 'var(--green)' }} />}
                          <button onClick={() => clearItem(gIdx)} style={{ color: 'var(--text-3)' }}><X className="w-3.5 h-3.5" strokeWidth={2} /></button>
                        </div>
                        <div className="flex gap-2">
                          {(['_nv1','_nv2','_nv3'] as const).map((nv, ni) => (
                            <input key={nv} type="text" inputMode="numeric" value={item[nv]} placeholder={`NV${ni+1}`} maxLength={3}
                              onChange={e => handleNivelChange(gIdx, nv, e.target.value)}
                              className="flex-1 h-8 rounded-lg text-center text-xs outline-none"
                              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input type="text" value={item.local} placeholder="Local" onChange={e => updateItem(gIdx, 'local', e.target.value)}
                            className="flex-1 h-8 rounded-lg px-2 text-xs outline-none"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }} />
                          <input type="number" value={item.valor_total} placeholder="Valor" min="0" step="0.01" onChange={e => updateItem(gIdx, 'valor_total', e.target.value)}
                            className="w-28 h-8 rounded-lg px-2 text-xs text-right outline-none"
                            style={{ background: 'var(--surface-2)', border: `1px solid ${excedeTetoMat ? 'rgba(239,68,68,0.60)' : 'var(--border)'}`, color: 'var(--text-1)' }} />
                        </div>
                      </div>

                      {excedeTetoMat && rowTarefa && (
                        <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] flex-wrap" style={{ background: 'rgba(239,68,68,0.07)', borderTop: '1px solid rgba(239,68,68,0.25)' }}>
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" strokeWidth={2} style={{ color: '#EF4444' }} />
                          <span style={{ color: '#EF4444', fontWeight: 700 }}>TETO EXCEDIDO — {rowTarefa.codigo}</span>
                          <span style={{ color: 'var(--text-2)' }}>Teto: <strong>{formatCurrency(tetoMat)}</strong></span>
                          <span style={{ color: '#EF4444' }}>Excesso: <strong>+{formatCurrency(valorAtualNum - tetoMat)}</strong></span>
                        </div>
                      )}
                    </div>
                  )
                })}

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

        {/* Total sticky */}
        <div className="sticky bottom-0 z-10 rounded-xl flex items-center justify-between px-5 py-3"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', boxShadow: '0 -4px 24px rgba(0,0,0,0.10)' }}>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" strokeWidth={1.5} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-2)' }}>Total</span>
            {anyViolation && (
              <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                <AlertTriangle className="w-3 h-3" strokeWidth={2} /> teto excedido
              </span>
            )}
          </div>
          <span className="text-xl font-black" style={{ color: total > 0 ? 'var(--text-1)' : 'var(--text-3)' }}>{formatCurrency(total)}</span>
        </div>

        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href={`/contratos/${id}/fat-direto/${solId}`}>
            <Button variant="ghost" style={{ color: 'var(--text-3)' }}>Cancelar</Button>
          </Link>
          <Button
            onClick={salvar}
            disabled={saving || anyViolation}
            className="gap-2 text-white"
            style={{ background: anyViolation ? 'var(--surface-3)' : 'linear-gradient(135deg, var(--accent), var(--accent-glow))' }}
          >
            {saving ? (
              <><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Salvando...</>
            ) : (
              <><Save className="w-4 h-4" strokeWidth={1.5} /> Salvar Alterações</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
