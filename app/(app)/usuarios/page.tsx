'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, UserCheck, UserX, Pencil, X, Eye, EyeOff, Shield, Trash2 } from 'lucide-react'
import {
  MODULOS_CONFIG, MODULOS_LABELS, ACOES_LABELS, ALL_ACOES, TEMPLATES,
  type Permissao,
} from '@/lib/permissoes-config'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  criado_em: string
}

interface TemplateOption {
  id: string
  nome: string
  sistema: boolean
  permissoes: Array<{ modulo: string; acao: string }>
}

// Base perfil para templates customizados (acesso básico ao sistema)
const TEMPLATE_BASE_PERFIL: Record<string, Perfil> = {
  'Administrador': 'admin',
  'Engenheiro FIP': 'engenheiro_fip',
  'Visualizador': 'visualizador',
}

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador:   'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin:          'Administrador',
}
const PERFIL_COLORS: Record<string, string> = {
  visualizador:   'bg-slate-800/60 text-slate-400 border-slate-700/50',
  engenheiro_fip: 'bg-blue-900/30 text-blue-400 border-blue-800/50',
  admin:          'bg-amber-900/30 text-amber-400 border-amber-800/50',
}
const EMPTY_FORM = { nome: '', email: '', senha: '', template_id: '' }

export default function UsuariosPage() {
  const [usuarios, setUsuarios]             = useState<Usuario[]>([])
  const [templates, setTemplates]           = useState<TemplateOption[]>([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [showSenha, setShowSenha]           = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [erro, setErro]                     = useState('')
  const [editando, setEditando]             = useState<Usuario | null>(null)
  const [editForm, setEditForm]             = useState({ nome: '', template_id: '', nova_senha: '' })
  const [permissaoAberta, setPermissaoAberta] = useState<string | null>(null)
  const [permissoesMap, setPermissoesMap]   = useState<Record<string, Set<string>>>({})
  const [salvandoPerm, setSalvandoPerm]     = useState(false)
  const [excluindo, setExcluindo]           = useState<string | null>(null)

  async function carregar() {
    setLoading(true)
    const [resU, resT] = await Promise.all([
      fetch('/api/usuarios'),
      fetch('/api/perfis'),
    ])
    if (resU.ok) setUsuarios(await resU.json())
    if (resT.ok) setTemplates(await resT.json())
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // Resolve perfil base + nome do template selecionado
  function resolveTemplate(template_id: string) {
    const tpl = templates.find(t => t.id === template_id)
    if (!tpl) return { perfil: 'visualizador' as Perfil, template_nome: '' }
    const perfil = (TEMPLATE_BASE_PERFIL[tpl.nome] || 'visualizador') as Perfil
    return { perfil, template_nome: tpl.nome, permissoes: tpl.permissoes }
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    if (!form.template_id) { setErro('Selecione um perfil de acesso.'); setSaving(false); return }
    const { perfil, permissoes } = resolveTemplate(form.template_id)
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, perfil, template_id: form.template_id, permissoes_custom: permissoes }),
    })
    if (res.ok) { setForm(EMPTY_FORM); setShowForm(false); await carregar() }
    else { const d = await res.json(); setErro(d.error || 'Erro ao criar usuário') }
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
    setSaving(true); setErro('')
    const { perfil, permissoes } = resolveTemplate(editForm.template_id)
    const body: Record<string, unknown> = { nome: editForm.nome, perfil, template_id: editForm.template_id, permissoes_custom: permissoes }
    if (editForm.nova_senha) body.nova_senha = editForm.nova_senha
    const res = await fetch(`/api/usuarios/${editando.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { setEditando(null); await carregar() }
    else { const d = await res.json(); setErro(d.error || 'Erro ao salvar') }
    setSaving(false)
  }

  async function abrirPermissoes(userId: string) {
    setPermissaoAberta(permissaoAberta === userId ? null : userId)
    if (permissoesMap[userId]) return
    const res = await fetch(`/api/usuarios/${userId}/permissoes`)
    if (res.ok) {
      const data: Permissao[] = await res.json()
      setPermissoesMap(prev => ({ ...prev, [userId]: new Set(data.map(p => `${p.modulo}:${p.acao}`)) }))
    }
  }

  function togglePerm(userId: string, modulo: string, acao: string) {
    const key = `${modulo}:${acao}`
    setPermissoesMap(prev => {
      const s = new Set(prev[userId] || [])
      s.has(key) ? s.delete(key) : s.add(key)
      return { ...prev, [userId]: s }
    })
  }

  function aplicarTemplate(userId: string, tpl: keyof typeof TEMPLATES) {
    setPermissoesMap(prev => ({
      ...prev,
      [userId]: new Set(TEMPLATES[tpl].map(p => `${p.modulo}:${p.acao}`)),
    }))
  }

  async function deletarUsuario(u: Usuario) {
    if (!confirm(`Excluir permanentemente o usuário "${u.nome}" (${u.email})?\n\nEsta ação não pode ser desfeita.`)) return
    setExcluindo(u.id)
    await fetch(`/api/usuarios/${u.id}`, { method: 'DELETE' })
    setExcluindo(null)
    await carregar()
  }

  async function salvarPermissoes(userId: string) {
    setSalvandoPerm(true)
    const set = permissoesMap[userId] || new Set<string>()
    const permissoes = Array.from(set).map(k => {
      const [modulo, acao] = k.split(':')
      return { modulo, acao }
    })
    await fetch(`/api/usuarios/${userId}/permissoes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissoes }),
    })
    setSalvandoPerm(false)
    setPermissaoAberta(null)
  }

  const ativos = usuarios.filter(u => u.ativo).length
  const modulos = Object.keys(MODULOS_CONFIG) as Array<keyof typeof MODULOS_CONFIG>

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

      <div className="p-3 sm:p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[var(--text-3)] uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-[var(--text-1)] mt-1">{usuarios.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[var(--text-3)] uppercase tracking-wide">Ativos</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{ativos}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-5">
            <p className="text-xs text-[var(--text-3)] uppercase tracking-wide">Inativos</p>
            <p className="text-2xl font-bold text-[var(--text-3)] mt-1">{usuarios.length - ativos}</p>
          </CardContent></Card>
        </div>

        {/* Formulário de criação */}
        {showForm && (
          <Card className="border-blue-500/30">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-[var(--text-2)]">Novo Usuário</CardTitle>
                <button onClick={() => setShowForm(false)} className="text-[var(--text-3)] hover:text-[var(--text-2)]"><X className="w-4 h-4" /></button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={criarUsuario} className="grid grid-cols-2 gap-4">
                {erro && <div className="col-span-2 p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-sm text-red-400">{erro}</div>}
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Nome completo</label>
                  <input required value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: João Silva"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">E-mail</label>
                  <input required type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="joao@fip.com.br"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Senha inicial</label>
                  <div className="relative">
                    <input required type={showSenha ? 'text' : 'password'} value={form.senha} minLength={8}
                      onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder="Mínimo 8 caracteres"
                      className="w-full px-3 py-2 pr-10 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500" />
                    <button type="button" onClick={() => setShowSenha(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Perfil de acesso *</label>
                  <select required value={form.template_id} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500">
                    <option value="">Selecione um perfil...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
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
                <CardTitle className="text-sm text-[var(--text-2)]">Editar — {editando.email}</CardTitle>
                <button onClick={() => setEditando(null)} className="text-[var(--text-3)] hover:text-[var(--text-2)]"><X className="w-4 h-4" /></button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={salvarEdicao} className="grid grid-cols-2 gap-4">
                {erro && <div className="col-span-2 p-3 rounded-lg bg-red-900/20 border border-red-800/50 text-sm text-red-400">{erro}</div>}
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Nome</label>
                  <input required value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Perfil</label>
                  <select value={editForm.template_id} onChange={e => setEditForm(f => ({ ...f, template_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500">
                    <option value="">Selecione um perfil...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Nova senha (deixe em branco para não alterar)</label>
                  <input type="password" value={editForm.nova_senha} minLength={8} onChange={e => setEditForm(f => ({ ...f, nova_senha: e.target.value }))}
                    placeholder="Nova senha (mínimo 8 caracteres)"
                    className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500" />
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

        {/* Tabela */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--text-2)]">Usuários cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
            ) : (
              <div>
                {usuarios.map(u => (
                  <div key={u.id}>
                    {/* Linha do usuário */}
                    <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--border)] hover:bg-[var(--surface-2)]/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[var(--text-1)]">{u.nome}</p>
                        <p className="text-xs text-[var(--text-3)]">{u.email}</p>
                      </div>
                      <Badge className={PERFIL_COLORS[u.perfil] || 'bg-slate-800/60 text-slate-400 border-slate-700/50'}>
                        {PERFIL_LABELS[u.perfil] || u.perfil}
                      </Badge>
                      {u.ativo
                        ? <span className="flex items-center gap-1.5 text-emerald-400 text-xs w-16"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />Ativo</span>
                        : <span className="flex items-center gap-1.5 text-[var(--text-3)] text-xs w-16"><span className="w-1.5 h-1.5 rounded-full bg-[#475569] flex-shrink-0" />Inativo</span>
                      }
                      <div className="flex items-center gap-1">
                        <button onClick={() => abrirPermissoes(u.id)} title="Permissões"
                          className={`p-1.5 rounded-lg transition-colors ${permissaoAberta === u.id ? 'text-blue-400 bg-blue-900/20' : 'text-[var(--text-3)] hover:text-blue-400 hover:bg-blue-900/20'}`}>
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => {
                          // Resolve o template_id do usuário pelo nome do perfil
                          const tpl = templates.find(t => TEMPLATE_BASE_PERFIL[t.nome] === u.perfil && t.sistema) || templates[0]
                          setEditando(u)
                          setEditForm({ nome: u.nome, template_id: tpl?.id || '', nova_senha: '' })
                          setErro('')
                        }} title="Editar"
                          className="p-1.5 rounded-lg transition-colors text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleAtivo(u)} title={u.ativo ? 'Desativar' : 'Reativar'}
                          className={`p-1.5 rounded-lg transition-colors ${u.ativo ? 'text-[var(--text-3)] hover:text-amber-400 hover:bg-amber-900/20' : 'text-[var(--text-3)] hover:text-emerald-400 hover:bg-emerald-900/20'}`}>
                          {u.ativo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => deletarUsuario(u)} title="Excluir usuário permanentemente"
                          className="p-1.5 rounded-lg transition-colors text-[var(--text-3)] hover:text-red-400 hover:bg-red-900/20"
                          disabled={excluindo === u.id}>
                          {excluindo === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Painel de permissões */}
                    {permissaoAberta === u.id && (
                      <div className="bg-[var(--background)] border-b border-[var(--border)] px-6 py-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Permissões — {u.nome}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-[var(--text-3)]">Perfis:</span>
                            {templates.map(tpl => (
                              <button key={tpl.id}
                                onClick={() => setPermissoesMap(prev => ({
                                  ...prev,
                                  [u.id]: new Set(tpl.permissoes.map((p: any) => `${p.modulo}:${p.acao}`)),
                                }))}
                                className="text-[11px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--text-2)] hover:border-[#475569] transition-colors">
                                {tpl.nome}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Matriz */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr>
                                <th className="text-left py-2 pr-4 text-[var(--text-3)] font-medium w-32">Módulo</th>
                                {ALL_ACOES.map(acao => (
                                  <th key={acao} className="text-center py-2 px-3 text-[var(--text-3)] font-medium w-24">{ACOES_LABELS[acao]}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1E293B]/50">
                              {modulos.map(modulo => {
                                const acoesPossiveis = MODULOS_CONFIG[modulo]
                                const set = permissoesMap[u.id]
                                return (
                                  <tr key={modulo} className="hover:bg-[var(--surface-2)]/30">
                                    <td className="py-2.5 pr-4 font-medium text-[var(--text-2)]">{MODULOS_LABELS[modulo]}</td>
                                    {ALL_ACOES.map(acao => {
                                      const suporta = acoesPossiveis.includes(acao)
                                      const marcado  = set?.has(`${modulo}:${acao}`) ?? false
                                      return (
                                        <td key={acao} className="py-2.5 px-3 text-center">
                                          {suporta ? (
                                            <input
                                              type="checkbox"
                                              checked={marcado}
                                              onChange={() => togglePerm(u.id, modulo, acao)}
                                              className="w-4 h-4 accent-blue-500 cursor-pointer"
                                            />
                                          ) : (
                                            <span className="text-[#1E293B]">—</span>
                                          )}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                          <Button variant="outline" size="sm" onClick={() => setPermissaoAberta(null)}>Cancelar</Button>
                          <Button size="sm" disabled={salvandoPerm} onClick={() => salvarPermissoes(u.id)}>
                            {salvandoPerm ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar permissões'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
