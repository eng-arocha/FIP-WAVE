'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import { Building2, Plus, Search, Pencil, Phone, Mail, User, Loader2 } from 'lucide-react'
import { Empresa, EmpresaTipo } from '@/types'
import { formatCNPJ } from '@/lib/utils'

const TIPO_LABELS: Record<EmpresaTipo, string> = {
  contratante: 'Contratante',
  contratado: 'Contratado',
  ambos: 'Ambos',
}

const TIPO_COLORS: Record<EmpresaTipo, { badge: string; dot: string; icon: string }> = {
  contratante: {
    badge: 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
    dot: '#3B82F6',
    icon: 'rgba(59,130,246,0.15)',
  },
  contratado: {
    badge: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
    dot: '#A855F7',
    icon: 'rgba(168,85,247,0.15)',
  },
  ambos: {
    badge: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    dot: '#10B981',
    icon: 'rgba(16,185,129,0.15)',
  },
}

const EMPTY_FORM = {
  nome: '',
  cnpj: '',
  tipo: 'contratado' as EmpresaTipo,
  email_contato: '',
  telefone: '',
  responsavel: '',
  endereco: '',
}

export default function EmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Empresa | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/empresas')
      .then(r => r.json())
      .then(data => { setEmpresas(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtradas = empresas.filter(e =>
    e.nome.toLowerCase().includes(busca.toLowerCase()) ||
    e.cnpj?.includes(busca) ||
    e.email_contato?.toLowerCase().includes(busca.toLowerCase())
  )

  function abrirNova() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function abrirEdicao(empresa: Empresa) {
    setEditando(empresa)
    setForm({
      nome: empresa.nome,
      cnpj: empresa.cnpj || '',
      tipo: empresa.tipo,
      email_contato: empresa.email_contato || '',
      telefone: empresa.telefone || '',
      responsavel: empresa.responsavel || '',
      endereco: empresa.endereco || '',
    })
    setModalOpen(true)
  }

  async function salvar() {
    if (!form.nome || !form.tipo) return
    setSaving(true)
    try {
      if (editando) {
        const res = await fetch(`/api/empresas/${editando.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        })
        const updated = await res.json()
        setEmpresas(prev => prev.map(e => e.id === editando.id ? updated : e))
      } else {
        const res = await fetch('/api/empresas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, ativo: true }),
        })
        const nova = await res.json()
        setEmpresas(prev => [...prev, nova])
      }
      setModalOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--background)' }}>
      <Topbar
        title="Empresas"
        subtitle="Gerenciamento de contratantes e contratados"
        actions={
          <Button size="sm" onClick={abrirNova}>
            <Plus className="w-4 h-4" />
            Nova Empresa
          </Button>
        }
      />

      <div className="p-3 sm:p-6">
        {/* Busca */}
        <div className="relative mb-6 max-w-sm">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-3)' }}
          />
          <input
            placeholder="Buscar empresa..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-1)',
            }}
            value={busca}
            onChange={e => setBusca(e.target.value)}
            onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12" style={{ color: 'var(--text-3)' }}>
            <Loader2 className="w-6 h-6 animate-spin mr-2" style={{ color: '#3B82F6' }} />
            <span>Carregando empresas...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtradas.map(empresa => {
              const colors = TIPO_COLORS[empresa.tipo]
              return (
                <div
                  key={empresa.id}
                  className="rounded-xl transition-all duration-200"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    backdropFilter: 'blur(8px)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#2d3f5c')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#1E293B')}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: colors.icon }}
                        >
                          <Building2 className="w-5 h-5" style={{ color: colors.dot }} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-1)' }}>
                            {empresa.nome}
                          </p>
                          {empresa.cnpj && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                              {empresa.cnpj}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${colors.badge}`}>
                        {TIPO_LABELS[empresa.tipo]}
                      </span>
                    </div>

                    <div
                      className="space-y-1.5 pt-3 mb-3"
                      style={{ borderTop: '1px solid #1E293B' }}
                    >
                      {empresa.responsavel && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <User className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          {empresa.responsavel}
                        </div>
                      )}
                      {empresa.email_contato && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <Mail className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          {empresa.email_contato}
                        </div>
                      )}
                      {empresa.telefone && (
                        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-2)' }}>
                          <Phone className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-3)' }} />
                          {empresa.telefone}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end" style={{ borderTop: '1px solid #1E293B', paddingTop: '12px' }}>
                      <button
                        onClick={() => abrirEdicao(empresa)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--text-2)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-3)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; e.currentTarget.style.background = 'transparent' }}
                      >
                        <Pencil className="w-3 h-3" />
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {filtradas.length === 0 && !loading && (
              <div className="col-span-3 text-center py-12">
                <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: '#1E293B' }} />
                <p className="font-medium" style={{ color: 'var(--text-2)' }}>Nenhuma empresa encontrada</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Nova/Editar Empresa */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            <DialogDescription>Preencha os dados cadastrais da empresa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Razão Social *</Label>
                <input
                  placeholder="Nome completo da empresa"
                  value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <input
                  placeholder="00.000.000/0001-00"
                  value={form.cnpj}
                  onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v as EmpresaTipo }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contratante">Contratante</SelectItem>
                    <SelectItem value="contratado">Contratado</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <input
                  placeholder="Nome do responsável"
                  value={form.responsavel}
                  onChange={e => setForm(f => ({ ...f, responsavel: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <input
                  placeholder="(00) 00000-0000"
                  value={form.telefone}
                  onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-mail de Contato</Label>
                <input
                  type="email"
                  placeholder="email@empresa.com.br"
                  value={form.email_contato}
                  onChange={e => setForm(f => ({ ...f, email_contato: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Endereço</Label>
                <input
                  placeholder="Rua, nº, bairro - cidade/UF"
                  value={form.endereco}
                  onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'var(--surface-1)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-1)',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} loading={saving} disabled={!form.nome}>
              {editando ? 'Salvar Alterações' : 'Cadastrar Empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
