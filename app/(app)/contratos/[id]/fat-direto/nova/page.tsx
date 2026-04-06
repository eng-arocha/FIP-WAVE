'use client'

import { use, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { ArrowLeft, Plus, Trash2, Package, Save, AlertTriangle, Building2 } from 'lucide-react'

interface Tarefa {
  id: string
  codigo: string
  nome: string
  valor_material: number
  valor_servico: number
  grupo_macro?: { codigo: string; nome: string }
}

interface ItemForm {
  tarefa_id: string
  descricao: string
  local: string
  valor_total: string
}

export default function NovaSolicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])

  // Supplier info
  const [fornRazaoSocial, setFornRazaoSocial] = useState('')
  const [fornCnpj, setFornCnpj] = useState('')
  const [fornContato, setFornContato] = useState('')

  const [observacoes, setObservacoes] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([
    { tarefa_id: '', descricao: '', local: 'TORRE', valor_total: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [tetoViolation, setTetoViolation] = useState<any>(null)

  useEffect(() => {
    fetch(`/api/contratos/${id}/fat-direto/tarefas`)
      .then(r => r.json())
      .then(data => setTarefas(Array.isArray(data) ? data : []))
  }, [id])

  function addItem() {
    setItens(prev => [...prev, { tarefa_id: '', descricao: '', local: 'TORRE', valor_total: '' }])
  }

  function removeItem(i: number) {
    setItens(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateItem(i: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  function onTarefaChange(i: number, tarefaId: string) {
    const t = tarefas.find(t => t.id === tarefaId)
    setItens(prev => prev.map((item, idx) =>
      idx === i ? { ...item, tarefa_id: tarefaId, descricao: t ? t.nome.substring(0, 80) : item.descricao } : item
    ))
  }

  const total = itens.reduce((s, it) => s + (parseFloat(it.valor_total) || 0), 0)

  async function salvar() {
    setErro('')
    if (!fornRazaoSocial.trim()) { setErro('Informe a Razão Social do fornecedor.'); return }
    for (const it of itens) {
      if (!it.tarefa_id || !it.descricao || !it.local) {
        setErro('Preencha todos os campos de cada item.')
        return
      }
      if (!it.valor_total || parseFloat(it.valor_total) <= 0) {
        setErro('Informe o valor de cada item.')
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        fornecedor_razao_social: fornRazaoSocial,
        fornecedor_cnpj: fornCnpj,
        fornecedor_contato: fornContato,
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

  return (
    <div className="flex flex-col min-h-screen bg-[#080C14]">
      <Topbar title="Nova Solicitação" />
      <div className="flex-1 p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" size="sm" className="text-[#475569] hover:text-white gap-2">
              <ArrowLeft className="w-4 h-4" /> Faturamento Direto
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              Nova Solicitação de Autorização
            </h1>
            <p className="text-sm text-[#475569]">Solicite autorização WAVE para compra de materiais</p>
          </div>
        </div>

        {erro && (
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#FCA5A5' }}>
            {erro}
          </div>
        )}

        {tetoViolation && (
          <div className="rounded-2xl p-5 space-y-4" style={{ background: 'rgba(239,68,68,0.07)', border: '2px solid rgba(239,68,68,0.40)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-bold text-base mb-1">Saldo de Material Insuficiente</p>
                <p className="text-sm text-[#94A3B8]">
                  A solicitação de <strong className="text-red-300">{formatCurrency(tetoViolation.valor_novo)}</strong> excede o saldo disponível de{' '}
                  <strong className="text-red-300">{formatCurrency(tetoViolation.saldo_disponivel)}</strong>.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Teto do Contrato', value: tetoViolation.teto, color: '#94A3B8' },
                { label: 'Total Aprovado', value: tetoViolation.total_aprovado, color: '#EF4444' },
                { label: 'Saldo Disponível', value: tetoViolation.saldo_disponivel, color: tetoViolation.saldo_disponivel <= 0 ? '#EF4444' : '#F59E0B' },
              ].map(k => (
                <div key={k.label} className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.30)' }}>
                  <p className="text-xs text-[#475569] mb-1">{k.label}</p>
                  <p className="text-sm font-bold" style={{ color: k.color }}>{formatCurrency(k.value)}</p>
                </div>
              ))}
            </div>
            {tetoViolation.pedidos_bloqueantes?.length > 0 && (
              <div>
                <p className="text-xs text-[#475569] font-semibold uppercase tracking-wide mb-2">Pedidos Aprovados que Comprometem o Saldo</p>
                <div className="space-y-1.5">
                  {tetoViolation.pedidos_bloqueantes.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.20)' }}>
                      <span className="text-xs text-[#94A3B8]">
                        SOL-{String(p.numero).padStart(3, '0')} · {new Date(p.data_solicitacao).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="text-xs font-bold text-red-400">{formatCurrency(p.valor_total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={() => setTetoViolation(null)} className="text-xs text-[#475569] hover:text-[#94A3B8] transition-colors">
              Fechar alerta
            </button>
          </div>
        )}

        {/* ── STEP 1: Dados do Fornecedor ── */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Dados do Fornecedor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-[#475569] mb-1">Razão Social *</label>
                <input
                  type="text"
                  value={fornRazaoSocial}
                  onChange={e => setFornRazaoSocial(e.target.value)}
                  placeholder="Nome completo da empresa fornecedora"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: '#080C14', border: '1px solid #1E293B', color: '#F1F5F9' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B' }}
                />
              </div>
              <div>
                <label className="block text-xs text-[#475569] mb-1">CNPJ</label>
                <input
                  type="text"
                  value={fornCnpj}
                  onChange={e => setFornCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: '#080C14', border: '1px solid #1E293B', color: '#F1F5F9' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B' }}
                />
              </div>
              <div>
                <label className="block text-xs text-[#475569] mb-1">Contato (nome/telefone)</label>
                <input
                  type="text"
                  value={fornContato}
                  onChange={e => setFornContato(e.target.value)}
                  placeholder="Nome e telefone do responsável"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={{ background: '#080C14', border: '1px solid #1E293B', color: '#F1F5F9' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B' }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Observações */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">Observações</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Justificativa ou observações para esta solicitação..."
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none"
              style={{ background: '#080C14', border: '1px solid #1E293B', color: '#F1F5F9' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#1E293B' }}
            />
          </CardContent>
        </Card>

        {/* Items */}
        <Card style={{ background: '#0D1421', border: '1px solid #1E293B' }}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-white text-sm">Itens da Solicitação</CardTitle>
            <Button onClick={addItem} size="sm" variant="ghost" className="text-blue-400 hover:text-blue-300 gap-1">
              <Plus className="w-3.5 h-3.5" /> Adicionar Item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((item, i) => (
              <div key={i} className="p-4 rounded-xl space-y-3" style={{ background: '#080C14', border: '1px solid #1E293B' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#475569] font-semibold uppercase tracking-wide">Item {i + 1}</span>
                  {itens.length > 1 && (
                    <button onClick={() => removeItem(i)} className="text-[#475569] hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#475569] mb-1">Disciplina / Tarefa</label>
                    <select
                      value={item.tarefa_id}
                      onChange={e => onTarefaChange(i, e.target.value)}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: '#0D1421', border: '1px solid #1E293B', color: item.tarefa_id ? '#F1F5F9' : '#475569' }}
                    >
                      <option value="">Selecione a disciplina...</option>
                      {tarefas.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.codigo} — {t.nome.substring(0, 55)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#475569] mb-1">Local</label>
                    <input
                      type="text"
                      value={item.local}
                      onChange={e => updateItem(i, 'local', e.target.value)}
                      placeholder="TORRE, AP-101, etc."
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: '#0D1421', border: '1px solid #1E293B', color: '#F1F5F9' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-[#475569] mb-1">Descrição do Material</label>
                  <input
                    type="text"
                    value={item.descricao}
                    onChange={e => updateItem(i, 'descricao', e.target.value)}
                    placeholder="Descreva o material a ser adquirido..."
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: '#0D1421', border: '1px solid #1E293B', color: '#F1F5F9' }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#475569] mb-1">Valor Total do Item (R$)</label>
                    <input
                      type="number"
                      value={item.valor_total}
                      onChange={e => updateItem(i, 'valor_total', e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                      style={{ background: '#0D1421', border: '1px solid #1E293B', color: '#F1F5F9' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#475569] mb-1">Valor</label>
                    <div className="rounded-xl px-3 py-2.5 text-sm font-bold text-blue-400"
                      style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                      {formatCurrency(parseFloat(item.valor_total) || 0)}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between pt-3 border-t border-[#1E293B]">
              <span className="text-sm text-[#94A3B8] font-semibold">Total da Solicitação</span>
              <span className="text-xl font-black text-white">{formatCurrency(total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <Link href={`/contratos/${id}/fat-direto`}>
            <Button variant="ghost" className="text-[#475569] hover:text-white">Cancelar</Button>
          </Link>
          <Button
            onClick={salvar}
            disabled={saving}
            className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
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
              <>
                <Save className="w-4 h-4" /> Enviar para Aprovação
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
