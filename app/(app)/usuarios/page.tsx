'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, UserCheck, UserX, Pencil, X, Eye, EyeOff } from 'lucide-react'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  criado_em: string
}

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador: 'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin: 'Administrador',
}

const PERFIL_COLORS: Record<Perfil, string> = {
  visualizador: 'bg-slate-800/60 text-slate-400 border-slate-700/50',
  engenheiro_fip: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  admin: 'bg-amber-900/30 text-amber-400 border-amber-800/50',
}

const EMPTY_FORM = { nome: '', email: '', senha: '', perfil: 'engenheiro_fip' as Perfil }

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [showSenha, setShowSenha] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [editForm, setEditForm] = useState({ nome: '', perfil: '' as Perfil, nova_senha: '' })

  async function carregar() {
    setLoading(true)
    const res = await fetch('/api/usuarios')
    if (res.ok) setUsuarios(await res.json())
    setLoading(false)
  }

  useEffect(() => { carregar() }, [])

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErro('')
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm(EMPTY_FORM)
      setShowForm(false)
      await carregar()
    } else {
      const data = await res.json()
      setErro(data.error || 'Erro ao criar usuário')
    }
    setSaving(false)
  }

  async function toggleAtivo(u: Usuario) {
    await fetch(`/api/usuarios/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !u.ativo }),
    })
    await carregar()
  }

  async function salvarEdicao(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setSaving(true)
    setErro('')
    const body: Record<string, unknown> = { nome: editForm.nome, perfil: editForm.perfil }
    if (editForm.nova_senha) body.nova_senha = editForm.nova_senha
    const res = await fetch(`/api/usuarios/${editando.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditando(null)
      await carregar()
    } else {
      const data = await res.json()
      setErro(data.error || 'Erro ao salvar')
    }
    setSaving(false)
  }

  function abrirEdicao(u: Usuario) {
    setEditando(u)
    setEditForm({ nome: u.nome, perfil: u.perfil, nova_senha: '' })
    setErro('')
  }

  const ativos = usuarios.filter(u => u.ativo).length

  return (
    <div className="flex-1 overflow-auto">
      <Topbar
        title="Usuários"
        subtitle="Gerenciamento de acessos ao sistema"
        actions={
          <Button size="sm" onClick={() => { setShowForm(true); setErro('') }}>
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[#475569] uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-[#F1F5F9] mt-1">{usuarios.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[#475569] uppercase tracking-wide">Ativos</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{ativos}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[#475569] uppercase tracking-wide">Inativos</p>
            <p className="text-2xl font-bold text-[#475569] mt-1">{usuarios.length - ativos}</p>
          </CardContent></Card>
        </div>

        {/* Formulário de criação */}
        {showForm && (
          <Card className="border-blue-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-[#94A3B8]">Novo Usuário</CardTitle>
                <button onClick={() => setShowForm(false)} className="text-[#475569] hover:text-[#94A3B8]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={criarUsuario} className="grid grid-cols-2 gap-4">
                {erro && (
                  <div className="col-span-2 p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-sm text-red-400">{erro}</div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Nome completo</label>
                  <input
                    required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: João Silva"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">E-mail</label>
                  <input
                    required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="joao@fip.com.br"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Senha inicial</label>
                  <div className="relative">
                    <input
                      required type={showSenha ? 'text' : 'password'} value={form.senha} minLength={8}
                      onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full px-3 py-2 pr-10 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                    />
                    <button type="button" onClick={() => setShowSenha(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569]">
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Perfil de acesso</label>
                  <select
                    value={form.perfil} onChange={e => setForm(f => ({ ...f, perfil: e.target.value as Perfil }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  >
                    <option value="visualizador">Visualizador</option>
                    <option value="engenheiro_fip">Engenheiro FIP</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="col-span-2 flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar usuário'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Modal de edição */}
        {editando && (
          <Card className="border-blue-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-[#94A3B8]">Editar — {editando.email}</CardTitle>
                <button onClick={() => setEditando(null)} className="text-[#475569] hover:text-[#94A3B8]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={salvarEdicao} className="grid grid-cols-2 gap-4">
                {erro && (
                  <div className="col-span-2 p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-sm text-red-400">{erro}</div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Nome</label>
                  <input
                    required value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Perfil</label>
                  <select
                    value={editForm.perfil} onChange={e => setEditForm(f => ({ ...f, perfil: e.target.value as Perfil }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  >
                    <option value="visualizador">Visualizador</option>
                    <option value="engenheiro_fip">Engenheiro FIP</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[#475569] uppercase tracking-wide font-medium">Nova senha (deixe em branco para não alterar)</label>
                  <input
                    type="password" value={editForm.nova_senha} minLength={8}
                    onChange={e => setEditForm(f => ({ ...f, nova_senha: e.target.value }))}
                    placeholder="Nova senha (mínimo 8 caracteres)"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[#0D1421] border border-[#1E293B] text-[#F1F5F9] outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-2 flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditando(null)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tabela de usuários */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[#94A3B8]">Usuários cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E293B]">
                      <th className="text-left px-6 py-3 text-xs text-[#475569] uppercase tracking-wide font-medium">Nome</th>
                      <th className="text-left px-6 py-3 text-xs text-[#475569] uppercase tracking-wide font-medium">E-mail</th>
                      <th className="text-left px-6 py-3 text-xs text-[#475569] uppercase tracking-wide font-medium">Perfil</th>
                      <th className="text-left px-6 py-3 text-xs text-[#475569] uppercase tracking-wide font-medium">Status</th>
                      <th className="text-right px-6 py-3 text-xs text-[#475569] uppercase tracking-wide font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E293B]">
                    {usuarios.map(u => (
                      <tr key={u.id} className="hover:bg-[#111827]/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-[#F1F5F9]">{u.nome}</td>
                        <td className="px-6 py-4 text-[#475569]">{u.email}</td>
                        <td className="px-6 py-4">
                          <Badge className={PERFIL_COLORS[u.perfil]}>{PERFIL_LABELS[u.perfil]}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          {u.ativo
                            ? <span className="flex items-center gap-1.5 text-emerald-400 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Ativo</span>
                            : <span className="flex items-center gap-1.5 text-[#475569] text-xs"><span className="w-1.5 h-1.5 rounded-full bg-[#475569]" />Inativo</span>
                          }
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => abrirEdicao(u)}
                              className="p-1.5 rounded-lg text-[#475569] hover:text-[#94A3B8] hover:bg-[#1E293B] transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleAtivo(u)}
                              className={`p-1.5 rounded-lg transition-colors ${u.ativo ? 'text-[#475569] hover:text-red-400 hover:bg-red-900/20' : 'text-[#475569] hover:text-emerald-400 hover:bg-emerald-900/20'}`}
                              title={u.ativo ? 'Desativar' : 'Reativar'}
                            >
                              {u.ativo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
