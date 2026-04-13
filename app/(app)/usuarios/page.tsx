'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, UserCheck, UserX, Pencil, X, Eye, EyeOff, Shield, Trash2, Link2, Wand2, Copy, Building2, CheckCircle2 } from 'lucide-react'
import {
  MODULOS_CONFIG, MODULOS_LABELS, ACOES_LABELS, ALL_ACOES,
  type Permissao,
} from '@/lib/permissoes-config'
import { gerarSenhaForte } from '@/lib/auth/senha'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

interface Usuario {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  criado_em: string
  template_id?: string | null
  permissoes_customizadas?: boolean
  template?: { id: string; nome: string } | null
}

interface TemplateOption {
  id: string
  nome: string
  sistema: boolean
  permissoes: Array<{ modulo: string; acao: string }>
}

interface ContratoOption {
  id: string
  numero: string
  descricao: string
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
  const [contratos, setContratos]           = useState<ContratoOption[]>([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [showSenha, setShowSenha]           = useState(false)
  const [senhaCopiada, setSenhaCopiada]     = useState(false)
  const [saving, setSaving]                 = useState(false)
  const [erro, setErro]                     = useState('')
  const [editando, setEditando]             = useState<Usuario | null>(null)
  const [editForm, setEditForm]             = useState({ nome: '', template_id: '', nova_senha: '' })
  const [permissaoAberta, setPermissaoAberta] = useState<string | null>(null)
  const [permissoesMap, setPermissoesMap]   = useState<Record<string, Set<string>>>({})
  // Estado da flag "Permissões específicas" por usuário (true = ilha)
  const [customizadasMap, setCustomizadasMap] = useState<Record<string, boolean>>({})
  // Nome do template herdado (só pra mostrar na mensagem "Herdando de X")
  const [templateNomeMap, setTemplateNomeMap] = useState<Record<string, string | null>>({})
  const [salvandoPerm, setSalvandoPerm]     = useState(false)
  const [excluindo, setExcluindo]           = useState<string | null>(null)
  // Vínculo usuário × contrato
  const [contratoAberto, setContratoAberto] = useState<string | null>(null)
  const [contratosMap, setContratosMap]     = useState<Record<string, Set<string>>>({})
  const [salvandoContratos, setSalvandoContratos] = useState(false)

  async function carregar() {
    setLoading(true)
    const [resU, resT, resC] = await Promise.all([
      fetch('/api/usuarios'),
      fetch('/api/perfis'),
      fetch('/api/contratos'),
    ])
    if (resU.ok) setUsuarios(await resU.json())
    if (resT.ok) setTemplates(await resT.json())
    if (resC.ok) setContratos(await resC.json())
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  // Resolve perfil base + nome do template selecionado.
  // IMPORTANTE: para templates customizados (não-nativos), retorna perfil=null
  // — quem chama deve OMITIR o campo `perfil` no body do PUT, para não
  // sobrescrever o enum atual do usuário. O enum só é atualizado quando o
  // template escolhido é um dos 3 nativos (admin/engenheiro_fip/visualizador).
  function resolveTemplate(template_id: string): {
    perfil: Perfil | null
    template_nome: string
    permissoes?: Permissao[]
  } {
    const tpl = templates.find(t => t.id === template_id)
    if (!tpl) return { perfil: 'visualizador', template_nome: '' }
    const perfilBase = TEMPLATE_BASE_PERFIL[tpl.nome] as Perfil | undefined
    return {
      perfil: perfilBase ?? null, // null = template custom, não mexe no enum
      template_nome: tpl.nome,
      permissoes: tpl.permissoes,
    }
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    if (!form.template_id) { setErro('Selecione um perfil de acesso.'); setSaving(false); return }
    const { perfil, permissoes } = resolveTemplate(form.template_id)
    // Para templates custom, perfil é null → default visualizador só no INSERT
    // inicial (não vai afetar permissões, que vêm do template via LIVE resolver).
    const perfilParaInsert: Perfil = perfil ?? 'visualizador'
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        perfil: perfilParaInsert,
        template_id: form.template_id,
        permissoes_custom: permissoes,
      }),
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
    const { perfil } = resolveTemplate(editForm.template_id)
    // Para templates CUSTOM (perfil === null), NÃO enviamos o campo 'perfil'
    // no body — preserva o enum atual do usuário. Para nativos, atualiza o enum.
    // Permissões NÃO são alteradas por este fluxo — use o painel de permissões
    // (ícone Shield) que chama /api/usuarios/[id]/permissoes separadamente.
    const body: Record<string, unknown> = {
      nome: editForm.nome,
      template_id: editForm.template_id,
    }
    if (perfil) body.perfil = perfil
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
    setContratoAberto(null) // fecha o painel de contratos
    // Sempre recarrega ao abrir (para refletir mudanças externas no template)
    const res = await fetch(`/api/usuarios/${userId}/permissoes`)
    if (res.ok) {
      const data = await res.json()
      // Nova resposta: { permissoes, permissoes_customizadas, template_id, template_nome, fonte }
      const permissoes: Permissao[] = data.permissoes ?? []
      setPermissoesMap(prev => ({
        ...prev,
        [userId]: new Set(permissoes.map(p => `${p.modulo}:${p.acao}`))
      }))
      setCustomizadasMap(prev => ({ ...prev, [userId]: data.permissoes_customizadas === true }))
      setTemplateNomeMap(prev => ({ ...prev, [userId]: data.template_nome ?? null }))
    }
  }

  /**
   * Alterna a flag "Permissões específicas" para um usuário.
   * - Ao MARCAR: o estado atual da matriz vira a ilha de customização
   *   (snapshot das permissões herdadas do template no momento da marca)
   * - Ao DESMARCAR: confirma e volta a herdar do template em tempo real.
   *   As permissões salvas em permissoes_usuario são apagadas.
   */
  async function toggleCustomizadas(userId: string, userName: string, templateNome: string | null) {
    const atual = customizadasMap[userId] === true
    if (atual) {
      // Desmarcando
      const msg = `Voltar a herdar do perfil "${templateNome ?? '—'}"? As permissões específicas de ${userName} serão descartadas e ele passará a acompanhar automaticamente as mudanças no perfil.`
      if (!confirm(msg)) return
      setSalvandoPerm(true)
      const res = await fetch(`/api/usuarios/${userId}/permissoes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissoes_customizadas: false }),
      })
      if (res.ok) {
        // Recarrega pra pegar as permissões do template agora
        const r = await fetch(`/api/usuarios/${userId}/permissoes`)
        if (r.ok) {
          const data = await r.json()
          setPermissoesMap(prev => ({
            ...prev,
            [userId]: new Set((data.permissoes ?? []).map((p: Permissao) => `${p.modulo}:${p.acao}`))
          }))
          setCustomizadasMap(prev => ({ ...prev, [userId]: false }))
          setTemplateNomeMap(prev => ({ ...prev, [userId]: data.template_nome ?? null }))
        }
      }
      setSalvandoPerm(false)
    } else {
      // Marcando — apenas atualiza o estado local, o salvamento acontece quando admin
      // clicar "Salvar permissões". Até lá o admin pode editar a matriz.
      setCustomizadasMap(prev => ({ ...prev, [userId]: true }))
    }
  }

  function togglePerm(userId: string, modulo: string, acao: string) {
    // Só permite editar se a flag de customização está marcada.
    // Caso contrário, o usuário está herdando do template (read-only).
    if (!customizadasMap[userId]) return
    const key = `${modulo}:${acao}`
    setPermissoesMap(prev => {
      const s = new Set(prev[userId] || [])
      s.has(key) ? s.delete(key) : s.add(key)
      return { ...prev, [userId]: s }
    })
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
    // Envia a flag junto: true = salva como ilha, false = volta a herdar
    await fetch(`/api/usuarios/${userId}/permissoes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permissoes,
        permissoes_customizadas: customizadasMap[userId] === true,
      }),
    })
    setSalvandoPerm(false)
    setPermissaoAberta(null)
  }

  // ── Vínculo usuário × contrato ─────────────────────────────
  async function abrirContratos(userId: string) {
    const novo = contratoAberto === userId ? null : userId
    setContratoAberto(novo)
    setPermissaoAberta(null) // fecha o outro painel
    if (!novo) return
    if (contratosMap[userId]) return
    const res = await fetch(`/api/usuarios/${userId}/contratos`)
    if (res.ok) {
      const ids: string[] = await res.json()
      setContratosMap(prev => ({ ...prev, [userId]: new Set(ids) }))
    }
  }

  function toggleContrato(userId: string, contratoId: string) {
    setContratosMap(prev => {
      const s = new Set(prev[userId] || [])
      s.has(contratoId) ? s.delete(contratoId) : s.add(contratoId)
      return { ...prev, [userId]: s }
    })
  }

  async function salvarContratos(userId: string) {
    setSalvandoContratos(true)
    const contrato_ids = Array.from(contratosMap[userId] || new Set<string>())
    await fetch(`/api/usuarios/${userId}/contratos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contrato_ids }),
    })
    setSalvandoContratos(false)
    setContratoAberto(null)
  }

  // ── Gerador de senha + cópia ────────────────────────────────
  function gerarECopiarSenha() {
    const nova = gerarSenhaForte(12)
    setForm(f => ({ ...f, senha: nova }))
    setShowSenha(true)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(nova).catch(() => {})
    }
    setSenhaCopiada(true)
    setTimeout(() => setSenhaCopiada(false), 2500)
  }

  async function copiarSenhaAtual() {
    if (!form.senha) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(form.senha).catch(() => {})
    }
    setSenhaCopiada(true)
    setTimeout(() => setSenhaCopiada(false), 2500)
  }

  const ativos = usuarios.filter(u => u.ativo).length
  const modulos = Object.keys(MODULOS_CONFIG) as Array<keyof typeof MODULOS_CONFIG>

  return (
    <div className="flex-1">
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
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Senha inicial</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={gerarECopiarSenha}
                        title="Gerar senha forte aleatória e copiar"
                        className="text-[11px] font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                      >
                        <Wand2 className="w-3 h-3" />
                        Gerar senha forte
                      </button>
                      {form.senha && (
                        <button
                          type="button"
                          onClick={copiarSenhaAtual}
                          title="Copiar senha atual"
                          className="text-[11px] font-medium text-[var(--text-3)] hover:text-[var(--text-1)] inline-flex items-center gap-1"
                        >
                          {senhaCopiada ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {senhaCopiada ? 'Copiada!' : 'Copiar'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <input required type={showSenha ? 'text' : 'password'} value={form.senha} minLength={8}
                      onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} placeholder="Mínimo 8 caracteres"
                      className="w-full px-3 py-2 pr-10 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500 font-mono" />
                    <button type="button" onClick={() => setShowSenha(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
                      {showSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-3)]">
                    Dica: clique em <strong>Gerar senha forte</strong> para criar e copiar automaticamente, envie ao usuário por um canal seguro e ele será obrigado a trocar no primeiro acesso.
                  </p>
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
                      {(() => {
                        // Preferimos o nome do template ligado ao usuário (inclusive
                        // customizados tipo "Administrativo Wave"). Se não tiver
                        // template linkado, cai para o label do enum legado.
                        const templateNome = u.template?.nome
                        const label = templateNome || PERFIL_LABELS[u.perfil] || u.perfil
                        // Cor: mantém mapeamento pelo enum (cores conhecidas).
                        // Templates customizados recebem cor padrão discreta.
                        const corClass = templateNome && !TEMPLATE_BASE_PERFIL[templateNome]
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : PERFIL_COLORS[u.perfil] || 'bg-slate-100 text-slate-700 border-slate-200'
                        return (
                          <Badge className={corClass} title={u.permissoes_customizadas ? 'Permissões específicas ativas' : undefined}>
                            {label}
                            {u.permissoes_customizadas && ' ★'}
                          </Badge>
                        )
                      })()}
                      {u.ativo
                        ? <span className="flex items-center gap-1.5 text-emerald-400 text-xs w-16"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />Ativo</span>
                        : <span className="flex items-center gap-1.5 text-[var(--text-3)] text-xs w-16"><span className="w-1.5 h-1.5 rounded-full bg-[#475569] flex-shrink-0" />Inativo</span>
                      }
                      <div className="flex items-center gap-1">
                        <button onClick={() => abrirContratos(u.id)} title="Vincular a contratos"
                          className={`p-1.5 rounded-lg transition-colors ${contratoAberto === u.id ? 'text-emerald-600 bg-emerald-50' : 'text-[var(--text-3)] hover:text-emerald-600 hover:bg-emerald-50'}`}>
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => abrirPermissoes(u.id)} title="Permissões"
                          className={`p-1.5 rounded-lg transition-colors ${permissaoAberta === u.id ? 'text-blue-400 bg-blue-900/20' : 'text-[var(--text-3)] hover:text-blue-400 hover:bg-blue-900/20'}`}>
                          <Shield className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => {
                          // Usa o template_id REAL do usuário (se existir).
                          // Só cai para o derivado do enum se não houver template ligado
                          // (usuário legado sem backfill da migration 026).
                          const tplId = u.template_id
                            || templates.find(t => TEMPLATE_BASE_PERFIL[t.nome] === u.perfil && t.sistema)?.id
                            || templates[0]?.id
                            || ''
                          setEditando(u)
                          setEditForm({ nome: u.nome, template_id: tplId, nova_senha: '' })
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
                    {permissaoAberta === u.id && (() => {
                      const customizadas = customizadasMap[u.id] === true
                      const templateNome = templateNomeMap[u.id]
                      return (
                      <div className="bg-[var(--background)] border-b border-[var(--border)] px-6 py-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide">Permissões — {u.nome}</p>
                        </div>

                        {/* Caixinha "Permissões específicas" */}
                        <label
                          className="flex items-start gap-3 p-3 rounded-xl mb-4 cursor-pointer transition-colors"
                          style={{
                            background: customizadas ? 'rgba(245,158,11,0.08)' : 'var(--surface-3)',
                            border: `1px solid ${customizadas ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={customizadas}
                            onChange={() => toggleCustomizadas(u.id, u.nome, templateNome ?? null)}
                            className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold" style={{ color: customizadas ? '#B45309' : 'var(--text-2)' }}>
                              Permissões específicas para este usuário
                            </p>
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-3)' }}>
                              {customizadas
                                ? <>Este usuário <strong>não</strong> é afetado por mudanças no perfil {templateNome ? <>"<strong>{templateNome}</strong>"</> : 'herdado'}. As permissões abaixo são exclusivas dele.</>
                                : <>Herdando do perfil {templateNome ? <>"<strong>{templateNome}</strong>"</> : '—'}. Mudanças feitas em <strong>/perfis</strong> afetam este usuário automaticamente. Marque esta caixinha para trancar as permissões dele.</>
                              }
                            </p>
                          </div>
                        </label>

                        {/* Matriz */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)' }}>
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
                                              disabled={!customizadas}
                                              title={!customizadas ? 'Marque "Permissões específicas" acima para editar' : undefined}
                                              className="w-4 h-4 accent-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
                          <Button variant="outline" size="sm" onClick={() => setPermissaoAberta(null)}>
                            {customizadas ? 'Cancelar' : 'Fechar'}
                          </Button>
                          {customizadas && (
                            <Button size="sm" disabled={salvandoPerm} onClick={() => salvarPermissoes(u.id)}>
                              {salvandoPerm ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar permissões específicas'}
                            </Button>
                          )}
                        </div>
                      </div>
                      )
                    })()}

                    {/* Painel de vínculo com contratos */}
                    {contratoAberto === u.id && (
                      <div className="bg-[var(--background)] border-b border-[var(--border)] px-6 py-5">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-semibold text-[var(--text-2)] uppercase tracking-wide flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5" />
                            Contratos vinculados — {u.nome}
                          </p>
                          <span className="text-[11px] text-[var(--text-3)]">
                            {(contratosMap[u.id]?.size || 0)} de {contratos.length} selecionado(s)
                          </span>
                        </div>

                        {contratos.length === 0 ? (
                          <p className="text-sm text-[var(--text-3)] py-2">Nenhum contrato cadastrado no sistema ainda.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                            {contratos.map(c => {
                              const marcado = contratosMap[u.id]?.has(c.id) ?? false
                              return (
                                <label
                                  key={c.id}
                                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                                    marcado
                                      ? 'border-emerald-400 bg-emerald-50'
                                      : 'border-[var(--border)] hover:border-[var(--border-hover)] hover:bg-[var(--surface-3)]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={marcado}
                                    onChange={() => toggleContrato(u.id, c.id)}
                                    className="mt-0.5 w-4 h-4 accent-emerald-600 cursor-pointer flex-shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-[var(--text-1)] truncate">{c.numero}</p>
                                    <p className="text-[11px] text-[var(--text-3)] truncate">{c.descricao}</p>
                                  </div>
                                </label>
                              )
                            })}
                          </div>
                        )}

                        <div className="flex justify-end gap-3 mt-4">
                          <Button variant="outline" size="sm" onClick={() => setContratoAberto(null)}>Cancelar</Button>
                          <Button size="sm" disabled={salvandoContratos} onClick={() => salvarContratos(u.id)}>
                            {salvandoContratos ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar vínculos'}
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
