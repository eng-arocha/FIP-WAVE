'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, X, Shield, Trash2, ChevronDown, ChevronUp, Lock, Users, AlertCircle } from 'lucide-react'
import { usePermissoes } from '@/lib/context/permissoes-context'
import {
  MODULOS_CONFIG, MODULOS_LABELS, ACOES_LABELS, ALL_ACOES,
  type Permissao,
} from '@/lib/permissoes-config'

interface Template {
  id: string
  nome: string
  descricao: string
  sistema: boolean
  permissoes: Permissao[]
  criado_em: string
}

type ModuloKey = keyof typeof MODULOS_CONFIG

const EMPTY_FORM = { nome: '', descricao: '' }

function buildInitialSet(permissoes: Permissao[]): Set<string> {
  return new Set(permissoes.map(p => `${p.modulo}:${p.acao}`))
}

function contarPermissoes(permissoes: Permissao[]) {
  return permissoes.length
}

export default function PerfisPage() {
  const { perfilAtual } = usePermissoes()
  const isAdmin = perfilAtual === 'admin'

  const [templates, setTemplates]           = useState<Template[]>([])
  const [loading, setLoading]               = useState(true)
  const [showForm, setShowForm]             = useState(false)
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [saving, setSaving]                 = useState(false)
  const [erro, setErro]                     = useState('')
  const [aberto, setAberto]                 = useState<string | null>(null)
  const [permMap, setPermMap]               = useState<Record<string, Set<string>>>({})
  const [salvandoPerm, setSalvandoPerm]     = useState(false)
  const [excluindo, setExcluindo]           = useState<string | null>(null)
  // Impacto por template: { total, afetados, ilhas }
  const [impacto, setImpacto] = useState<Record<string, { total: number; afetados: number; ilhas: number }>>({})
  const [confirmando, setConfirmando] = useState<Template | null>(null)

  const modulos = Object.keys(MODULOS_CONFIG) as ModuloKey[]

  async function carregar() {
    setLoading(true)
    const res = await fetch('/api/perfis')
    if (res.ok) setTemplates(await res.json())
    setLoading(false)
  }
  useEffect(() => { carregar() }, [])

  async function criarPerfil(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro('')
    const res = await fetch('/api/perfis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, permissoes: [] }),
    })
    if (res.ok) {
      setForm(EMPTY_FORM); setShowForm(false)
      await carregar()
    } else {
      const d = await res.json(); setErro(d.error || 'Erro ao criar perfil')
    }
    setSaving(false)
  }

  async function excluirPerfil(t: Template) {
    if (!confirm(`Excluir o perfil "${t.nome}"?`)) return
    setExcluindo(t.id)
    await fetch(`/api/perfis/${t.id}`, { method: 'DELETE' })
    setExcluindo(null)
    await carregar()
  }

  async function abrirPerfil(t: Template) {
    if (aberto === t.id) { setAberto(null); return }
    setAberto(t.id)
    if (!permMap[t.id]) {
      setPermMap(prev => ({ ...prev, [t.id]: buildInitialSet(t.permissoes) }))
    }
    // Busca o impacto (total/afetados/ilhas) em background
    if (!impacto[t.id]) {
      try {
        const r = await fetch(`/api/perfis/${t.id}/impacto`)
        if (r.ok) {
          const data = await r.json()
          setImpacto(prev => ({ ...prev, [t.id]: data }))
        }
      } catch {}
    }
  }

  function togglePerm(id: string, modulo: string, acao: string) {
    const key = `${modulo}:${acao}`
    setPermMap(prev => {
      const s = new Set(prev[id] || [])
      s.has(key) ? s.delete(key) : s.add(key)
      return { ...prev, [id]: s }
    })
  }

  // Clique no botão "Salvar permissões": se há impacto, abre confirm dialog.
  function pedirConfirmacao(t: Template) {
    const info = impacto[t.id]
    // Se não sabe o impacto ou é zero, salva direto
    if (!info || info.afetados === 0) {
      salvarPermissoes(t)
      return
    }
    setConfirmando(t)
  }

  async function salvarPermissoes(t: Template) {
    setSalvandoPerm(true)
    const set = permMap[t.id] || new Set<string>()
    const permissoes = Array.from(set).map(k => {
      const [modulo, acao] = k.split(':')
      return { modulo, acao }
    })
    const res = await fetch(`/api/perfis/${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissoes }),
    })
    if (res.ok) {
      await carregar()
      setAberto(null)
      setConfirmando(null)
      // Refresca o impacto (não mudou o número, mas garante consistência)
      try {
        const r = await fetch(`/api/perfis/${t.id}/impacto`)
        if (r.ok) {
          const data = await r.json()
          setImpacto(prev => ({ ...prev, [t.id]: data }))
        }
      } catch {}
    }
    setSalvandoPerm(false)
  }

  return (
    <div className="flex-1">
      <Topbar
        title="Perfis de Acesso"
        subtitle="Gerencie os perfis e permissões disponíveis no sistema"
        actions={
          isAdmin ? (
            <Button size="sm" onClick={() => { setShowForm(true); setErro('') }}>
              <Plus className="w-4 h-4" />
              Novo Perfil
            </Button>
          ) : undefined
        }
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* KPI — Total de perfis (full width) */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-3)' }}>Total de perfis</p>
                <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-1)' }}>
                  {loading ? <Loader2 className="w-6 h-6 animate-spin inline" /> : templates.length}
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>
                <Shield className="w-6 h-6 text-white" strokeWidth={1.5} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Formulário de criação — apenas admin */}
        {showForm && isAdmin && (
          <Card style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm" style={{ color: 'var(--text-2)' }}>Novo Perfil</CardTitle>
                <button onClick={() => setShowForm(false)} style={{ color: 'var(--text-3)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={criarPerfil} className="grid grid-cols-2 gap-4">
                {erro && (
                  <div className="col-span-2 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)' }}>
                    {erro}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-3)' }}>Nome do perfil *</label>
                  <input
                    required
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    placeholder="Ex: Engenheiro Júnior"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-3)' }}>Descrição</label>
                  <input
                    value={form.descricao}
                    onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                    placeholder="Descreva o nível de acesso"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: 'var(--surface-1)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                  />
                </div>
                <div className="col-span-2 flex justify-end gap-3 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
                  <Button type="submit" size="sm" disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar perfil'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Lista de perfis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm" style={{ color: 'var(--text-2)' }}>Perfis cadastrados</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: 'var(--text-3)' }}>
                Nenhum perfil cadastrado
              </div>
            ) : (
              <div>
                {templates.map(t => {
                  const isOpen = aberto === t.id
                  const set = permMap[t.id]
                  const total = contarPermissoes(t.permissoes)

                  return (
                    <div key={t.id}>
                      {/* Linha do perfil */}
                      <div
                        className="flex items-center gap-4 px-6 py-4 transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                      >
                        {/* Ícone */}
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            background: t.sistema
                              ? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
                              : 'linear-gradient(135deg, #10B981, #059669)',
                          }}
                        >
                          <Shield className="w-4 h-4 text-white" strokeWidth={1.5} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm" style={{ color: 'var(--text-1)' }}>{t.nome}</p>
                            {t.sistema && (
                              <span
                                className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: 'rgba(99,102,241,0.12)', color: '#818CF8' }}
                              >
                                <Lock className="w-2.5 h-2.5" />
                                Sistema
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-3)' }}>
                            {t.descricao || '—'} · {total} permissão{total !== 1 ? 'ões' : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => abrirPerfil(t)}
                            title={isAdmin ? 'Editar permissões' : 'Visualizar permissões'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{
                              background: isOpen ? 'rgba(99,102,241,0.12)' : 'var(--surface-3)',
                              color: isOpen ? '#818CF8' : 'var(--text-2)',
                            }}
                          >
                            {isAdmin ? 'Permissões' : 'Ver permissões'}
                            {isOpen
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          {isAdmin && !t.sistema && (
                            <button
                              onClick={() => excluirPerfil(t)}
                              title="Excluir perfil"
                              className="p-1.5 rounded-lg transition-colors"
                              style={{ color: 'var(--text-3)' }}
                              onMouseEnter={e => {
                                e.currentTarget.style.color = 'var(--red)'
                                e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.color = 'var(--text-3)'
                                e.currentTarget.style.background = ''
                              }}
                              disabled={excluindo === t.id}
                            >
                              {excluindo === t.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Painel de permissões */}
                      {isOpen && (
                        <div className="px-6 py-5" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--text-2)' }}>
                            Permissões — {t.nome}
                            {t.sistema && <span className="ml-2 font-normal normal-case" style={{ color: 'var(--text-3)' }}>(perfil nativo — nome não editável)</span>}
                          </p>

                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 z-10" style={{ background: 'var(--surface-2)' }}>
                                <tr>
                                  <th className="text-left py-2 pr-4 font-medium w-36" style={{ color: 'var(--text-3)' }}>Módulo</th>
                                  {ALL_ACOES.map(acao => (
                                    <th key={acao} className="text-center py-2 px-3 font-medium w-24" style={{ color: 'var(--text-3)' }}>
                                      {ACOES_LABELS[acao]}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {modulos.map(modulo => {
                                  const acoesPossiveis = MODULOS_CONFIG[modulo]
                                  return (
                                    <tr
                                      key={modulo}
                                      style={{ borderTop: '1px solid var(--border)' }}
                                    >
                                      <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--text-2)' }}>
                                        {MODULOS_LABELS[modulo]}
                                      </td>
                                      {ALL_ACOES.map(acao => {
                                        const suporta = acoesPossiveis.includes(acao)
                                        const marcado = set?.has(`${modulo}:${acao}`) ?? false
                                        return (
                                          <td key={acao} className="py-2.5 px-3 text-center">
                                            {suporta ? (
                                              <input
                                                type="checkbox"
                                                checked={marcado}
                                                onChange={() => togglePerm(t.id, modulo, acao)}
                                                disabled={!isAdmin}
                                                className="w-4 h-4 cursor-pointer accent-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
                                              />
                                            ) : (
                                              <span style={{ color: 'var(--border)' }}>—</span>
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

                          <div className="flex items-center justify-between mt-5 gap-3 flex-wrap">
                            {/* Contagem de impacto */}
                            {impacto[t.id] && impacto[t.id].total > 0 && (
                              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
                                <Users className="w-3.5 h-3.5" />
                                <span>
                                  <strong style={{ color: 'var(--text-2)' }}>{impacto[t.id].afetados}</strong> usuário(s) receberão a mudança
                                  {impacto[t.id].ilhas > 0 && (
                                    <> · <strong style={{ color: 'var(--text-2)' }}>{impacto[t.id].ilhas}</strong> com permissões específicas (não afetados)</>
                                  )}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-3 ml-auto">
                              <Button variant="outline" size="sm" onClick={() => setAberto(null)}>
                                {isAdmin ? 'Cancelar' : 'Fechar'}
                              </Button>
                              {isAdmin && (
                                <Button size="sm" disabled={salvandoPerm} onClick={() => pedirConfirmacao(t)}>
                                  {salvandoPerm ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar permissões'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirm modal: aviso de impacto antes de salvar mudanças globais */}
      {confirmando && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={() => !salvandoPerm && setConfirmando(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: '#FFFFFF', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 text-center">
              <div
                className="mx-auto mb-3 w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #FEF3C7, #FDE68A)' }}
              >
                <AlertCircle className="w-6 h-6" style={{ color: '#D97706' }} />
              </div>
              <h2 className="text-lg font-bold" style={{ color: '#1D1D1F' }}>
                Confirmar alteração global
              </h2>
              <p className="text-sm mt-2" style={{ color: '#86868B' }}>
                Esta mudança vai afetar <strong style={{ color: '#1D1D1F' }}>{impacto[confirmando.id]?.afetados ?? 0} usuário(s)</strong> que usam o perfil
                {' '}<strong style={{ color: '#1D1D1F' }}>{confirmando.nome}</strong>.
              </p>
              {(impacto[confirmando.id]?.ilhas ?? 0) > 0 && (
                <p className="text-xs mt-1.5" style={{ color: '#86868B' }}>
                  {impacto[confirmando.id]?.ilhas} usuário(s) com permissões específicas <strong>não</strong> serão afetados.
                </p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={salvandoPerm}
                onClick={() => setConfirmando(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={salvandoPerm}
                onClick={() => salvarPermissoes(confirmando)}
              >
                {salvandoPerm ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aplicar a todos'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
