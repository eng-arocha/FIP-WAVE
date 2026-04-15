'use client'

/**
 * Modal de edição de dados do contrato.
 * Edita campos da tabela `contratos` + dados das empresas (contratante/contratado).
 *
 * Requer permissão `contratos.editar` (validada no endpoint PATCH).
 */

import { useState, useEffect } from 'react'
import { X, Save, Loader2, Building2, FileText, Calendar, User } from 'lucide-react'

interface Empresa {
  id: string
  razao_social?: string | null
  cnpj?: string | null
  endereco?: string | null
  telefone?: string | null
  email?: string | null
}

interface ContratoEdit {
  numero?: string
  descricao?: string
  escopo?: string | null
  objeto?: string | null
  local_obra?: string | null
  fiscal_obra?: string | null
  email_fiscal?: string | null
  data_inicio?: string | null
  data_fim?: string | null
  status?: string
  observacoes?: string | null
  contratante?: Empresa
  contratado?: Empresa
}

interface Props {
  open: boolean
  onClose: () => void
  contratoId: string
  /** Dados iniciais do contrato (pra preencher o form) */
  initial: ContratoEdit
  onSaved: () => void
}

const STATUS_OPCOES = [
  { value: 'rascunho',   label: 'Rascunho' },
  { value: 'ativo',      label: 'Ativo' },
  { value: 'suspenso',   label: 'Suspenso' },
  { value: 'encerrado',  label: 'Encerrado' },
  { value: 'cancelado',  label: 'Cancelado' },
]

export function EditarContratoModal({ open, onClose, contratoId, initial, onSaved }: Props) {
  const [form, setForm] = useState<ContratoEdit>(initial)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [tab, setTab] = useState<'contrato' | 'contratante' | 'contratado'>('contrato')

  useEffect(() => {
    if (open) {
      setForm(initial)
      setErro('')
      setTab('contrato')
    }
  }, [open, initial])

  if (!open) return null

  async function salvar() {
    setSaving(true)
    setErro('')
    try {
      // Monta payload só com os campos que mudaram (opcional — manda tudo que não é vazio)
      const payload: any = {}
      for (const k of ['numero','descricao','escopo','objeto','local_obra','fiscal_obra','email_fiscal','data_inicio','data_fim','status','observacoes'] as const) {
        if (form[k] !== undefined && form[k] !== initial[k]) payload[k] = form[k]
      }
      if (form.contratante) {
        const c: any = {}
        for (const k of ['razao_social','cnpj','endereco','telefone','email'] as const) {
          if (form.contratante[k] !== undefined && form.contratante[k] !== initial.contratante?.[k]) c[k] = form.contratante[k]
        }
        if (Object.keys(c).length) payload.contratante = c
      }
      if (form.contratado) {
        const c: any = {}
        for (const k of ['razao_social','cnpj','endereco','telefone','email'] as const) {
          if (form.contratado[k] !== undefined && form.contratado[k] !== initial.contratado?.[k]) c[k] = form.contratado[k]
        }
        if (Object.keys(c).length) payload.contratado = c
      }

      if (Object.keys(payload).length === 0) {
        setErro('Nenhuma alteração pra salvar.')
        setSaving(false)
        return
      }

      const res = await fetch(`/api/contratos/${contratoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErro(data.error || 'Erro ao salvar.')
        setSaving(false)
        return
      }
      onSaved()
      onClose()
    } catch (e: any) {
      setErro(e?.message || 'Erro de rede.')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof ContratoEdit>(k: K, v: ContratoEdit[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  function updateEmpresa(tipo: 'contratante' | 'contratado', k: keyof Empresa, v: any) {
    setForm(prev => ({ ...prev, [tipo]: { ...(prev[tipo] || { id: '' }), [k]: v } }))
  }

  const input = 'w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500'
  const inputStyle = { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--text-1)' }
  const lbl = 'block text-xs font-medium text-[var(--text-3)] mb-1'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--text-1)' }}>Editar Contrato</h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded hover:bg-black/5 text-[var(--text-3)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-3 border-b flex gap-1" style={{ borderColor: 'var(--border)' }}>
          {([
            ['contrato',    'Contrato',    FileText],
            ['contratante', 'Contratante', Building2],
            ['contratado',  'Contratado',  Building2],
          ] as const).map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-t-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                tab === k ? 'bg-[var(--background)] border border-[var(--border)] border-b-transparent' : 'text-[var(--text-3)] hover:text-[var(--text-1)]'
              }`}
              style={tab === k ? { color: 'var(--text-1)', marginBottom: '-1px' } : {}}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {tab === 'contrato' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Número</label>
                  <input className={input} style={inputStyle} value={form.numero ?? ''} onChange={e => update('numero', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Status</label>
                  <select className={input} style={inputStyle} value={form.status ?? ''} onChange={e => update('status', e.target.value)}>
                    <option value="">—</option>
                    {STATUS_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={lbl}>Descrição</label>
                <input className={input} style={inputStyle} value={form.descricao ?? ''} onChange={e => update('descricao', e.target.value)} />
              </div>

              <div>
                <label className={lbl}>Objeto</label>
                <textarea className={input} style={inputStyle} rows={2} value={form.objeto ?? ''} onChange={e => update('objeto', e.target.value)} />
              </div>

              <div>
                <label className={lbl}>Escopo</label>
                <textarea className={input} style={inputStyle} rows={3} value={form.escopo ?? ''} onChange={e => update('escopo', e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Data Início</label>
                  <input type="date" className={input} style={inputStyle} value={form.data_inicio ?? ''} onChange={e => update('data_inicio', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Data Fim</label>
                  <input type="date" className={input} style={inputStyle} value={form.data_fim ?? ''} onChange={e => update('data_fim', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={lbl}>Local da Obra</label>
                <input className={input} style={inputStyle} value={form.local_obra ?? ''} onChange={e => update('local_obra', e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}><User className="w-3 h-3 inline mr-1" />Fiscal da Obra</label>
                  <input className={input} style={inputStyle} value={form.fiscal_obra ?? ''} onChange={e => update('fiscal_obra', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Email Fiscal</label>
                  <input type="email" className={input} style={inputStyle} value={form.email_fiscal ?? ''} onChange={e => update('email_fiscal', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={lbl}>Observações</label>
                <textarea className={input} style={inputStyle} rows={3} value={form.observacoes ?? ''} onChange={e => update('observacoes', e.target.value)} />
              </div>
            </>
          )}

          {(tab === 'contratante' || tab === 'contratado') && (
            <>
              <p className="text-xs text-[var(--text-3)]">
                {tab === 'contratante'
                  ? 'Dados da empresa contratante (quem contrata o serviço — ex: WAVE). Salvos em `empresas` vinculada via `contratante_id`.'
                  : 'Dados da empresa contratada (executora — ex: FIP Engenharia). Salvos em `empresas` vinculada via `contratado_id`.'}
              </p>
              <div>
                <label className={lbl}>Razão Social</label>
                <input className={input} style={inputStyle}
                  value={form[tab]?.razao_social ?? ''}
                  onChange={e => updateEmpresa(tab, 'razao_social', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>CNPJ</label>
                  <input className={input} style={inputStyle}
                    value={form[tab]?.cnpj ?? ''}
                    onChange={e => updateEmpresa(tab, 'cnpj', e.target.value)} />
                </div>
                <div>
                  <label className={lbl}>Telefone</label>
                  <input className={input} style={inputStyle}
                    value={form[tab]?.telefone ?? ''}
                    onChange={e => updateEmpresa(tab, 'telefone', e.target.value)} />
                </div>
              </div>
              <div>
                <label className={lbl}>Endereço</label>
                <textarea className={input} style={inputStyle} rows={2}
                  value={form[tab]?.endereco ?? ''}
                  onChange={e => updateEmpresa(tab, 'endereco', e.target.value)} />
              </div>
              <div>
                <label className={lbl}>Email</label>
                <input type="email" className={input} style={inputStyle}
                  value={form[tab]?.email ?? ''}
                  onChange={e => updateEmpresa(tab, 'email', e.target.value)} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border)' }}>
          {erro ? (
            <p className="text-xs text-red-400 flex-1 truncate">{erro}</p>
          ) : <div className="flex-1" />}
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--text-3)] hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}
