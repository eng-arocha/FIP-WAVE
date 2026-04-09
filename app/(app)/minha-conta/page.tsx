'use client'

import { useState, useEffect } from 'react'
import { Topbar } from '@/components/layout/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, Eye, EyeOff, Lock, CheckCircle2, AlertCircle, User, Mail, Shield, Check, X as XIcon } from 'lucide-react'
import { avaliarSenha, senhaEhForte, validarSenhaForte } from '@/lib/auth/senha'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

interface MeuPerfil {
  id: string
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
}

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador:   'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin:          'Administrador',
}
const PERFIL_COLORS: Record<string, string> = {
  visualizador:   'bg-slate-100 text-slate-700 border-slate-200',
  engenheiro_fip: 'bg-blue-50   text-blue-700   border-blue-200',
  admin:          'bg-amber-50  text-amber-700  border-amber-200',
}

export default function MinhaContaPage() {
  const [perfil, setPerfil] = useState<MeuPerfil | null>(null)
  const [loading, setLoading] = useState(true)

  const [senhaAtual,      setSenhaAtual]      = useState('')
  const [novaSenha,       setNovaSenha]       = useState('')
  const [confirmarSenha,  setConfirmarSenha]  = useState('')
  const [mostrarAtual,    setMostrarAtual]    = useState(false)
  const [mostrarNova,     setMostrarNova]     = useState(false)
  const [mostrarConfirma, setMostrarConfirma] = useState(false)

  const [salvando, setSalvando] = useState(false)
  const [erro,     setErro]     = useState('')
  const [sucesso,  setSucesso]  = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.ok) setPerfil(await res.json())
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setSucesso('')

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setErro('Preencha todos os campos.')
      return
    }
    const erroForte = validarSenhaForte(novaSenha)
    if (erroForte) {
      setErro(erroForte)
      return
    }
    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.')
      return
    }
    if (senhaAtual === novaSenha) {
      setErro('A nova senha deve ser diferente da atual.')
      return
    }

    setSalvando(true)
    try {
      const res = await fetch('/api/auth/alterar-senha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: novaSenha }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErro(data.error || 'Não foi possível alterar a senha.')
      } else {
        setSucesso('Senha alterada com sucesso!')
        setSenhaAtual(''); setNovaSenha(''); setConfirmarSenha('')
      }
    } catch {
      setErro('Erro de rede. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  const inputClass = 'w-full px-3 py-2 pr-10 rounded-lg text-sm bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-1)] outline-none focus:border-blue-500'

  return (
    <div className="flex-1 overflow-auto">
      <Topbar title="Minha Conta" subtitle="Suas informações e segurança" />

      <div className="p-3 sm:p-6 space-y-6 max-w-3xl">
        {/* Dados do usuário */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--text-2)]">Dados da conta</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
            ) : perfil ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5"><User className="w-3 h-3" /> Nome</p>
                  <p className="text-sm font-medium text-[var(--text-1)]">{perfil.nome || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5"><Mail className="w-3 h-3" /> E-mail</p>
                  <p className="text-sm font-medium text-[var(--text-1)] break-all">{perfil.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)] flex items-center gap-1.5"><Shield className="w-3 h-3" /> Perfil de acesso</p>
                  <Badge className={PERFIL_COLORS[perfil.perfil] || PERFIL_COLORS.visualizador}>
                    {PERFIL_LABELS[perfil.perfil] || perfil.perfil}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--text-3)]">Status</p>
                  {perfil.ativo
                    ? <span className="flex items-center gap-1.5 text-emerald-600 text-xs"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Ativo</span>
                    : <span className="flex items-center gap-1.5 text-[var(--text-3)] text-xs"><span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inativo</span>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-3)]">Não foi possível carregar seus dados.</p>
            )}
          </CardContent>
        </Card>

        {/* Alterar senha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-[var(--text-2)] flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Alterar senha
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={salvarSenha} className="space-y-4 max-w-md">
              {erro && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{erro}</span>
                </div>
              )}
              {sucesso && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{sucesso}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Senha atual</label>
                <div className="relative">
                  <input
                    type={mostrarAtual ? 'text' : 'password'}
                    value={senhaAtual}
                    onChange={e => setSenhaAtual(e.target.value)}
                    placeholder="Digite sua senha atual"
                    autoComplete="current-password"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => setMostrarAtual(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
                    tabIndex={-1}>
                    {mostrarAtual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Nova senha</label>
                <div className="relative">
                  <input
                    type={mostrarNova ? 'text' : 'password'}
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    placeholder="Digite sua nova senha"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => setMostrarNova(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
                    tabIndex={-1}>
                    {mostrarNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Checklist de requisitos — amigável e visual */}
              {(() => {
                const r = avaliarSenha(novaSenha)
                const Regra = ({ ok, texto }: { ok: boolean; texto: string }) => (
                  <div className="flex items-center gap-2 text-xs transition-colors" style={{ color: ok ? '#16A34A' : '#86868B' }}>
                    <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                      style={{ background: ok ? '#DCFCE7' : '#E5E5EA' }}>
                      {ok
                        ? <Check className="w-3 h-3" strokeWidth={3} />
                        : <XIcon className="w-3 h-3" strokeWidth={2.5} style={{ color: '#B8B8BF' }} />}
                    </span>
                    <span>{texto}</span>
                  </div>
                )
                return (
                  <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#F5F5F7' }}>
                    <Regra ok={r.minLength}    texto="Pelo menos 8 caracteres" />
                    <Regra ok={r.temMaiuscula} texto="Pelo menos 1 letra MAIÚSCULA (A-Z)" />
                    <Regra ok={r.temMinuscula} texto="Pelo menos 1 letra minúscula (a-z)" />
                    <Regra ok={r.temEspecial}  texto="Pelo menos 1 caractere especial (! @ # $ %)" />
                  </div>
                )
              })()}

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-3)] uppercase tracking-wide font-medium">Confirmar nova senha</label>
                <div className="relative">
                  <input
                    type={mostrarConfirma ? 'text' : 'password'}
                    value={confirmarSenha}
                    onChange={e => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                    minLength={8}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => setMostrarConfirma(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
                    tabIndex={-1}>
                    {mostrarConfirma ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={salvando || !senhaAtual || !senhaEhForte(novaSenha) || novaSenha !== confirmarSenha}
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar nova senha'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
