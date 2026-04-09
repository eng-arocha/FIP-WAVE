'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { avaliarSenha, senhaEhForte } from '@/lib/auth/senha'
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldAlert, LogOut, Check, X as XIcon } from 'lucide-react'

/**
 * Gate que bloqueia a UI quando o usuário precisa trocar a senha
 * (ex.: usou a senha padrão "12345678"). O modal NÃO pode ser fechado
 * — a única saída é (a) trocar a senha ou (b) sair do sistema.
 */
export function ForcePasswordChangeGate({
  deveTrocarSenha,
  children,
}: {
  deveTrocarSenha: boolean
  children: React.ReactNode
}) {
  const router = useRouter()
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha,  setNovaSenha]  = useState('')
  const [confirmar,  setConfirmar]  = useState('')
  const [mostrarAtual,  setMostrarAtual]  = useState(false)
  const [mostrarNova,   setMostrarNova]   = useState(false)
  const [mostrarConf,   setMostrarConf]   = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro]         = useState('')
  const [sucesso, setSucesso]   = useState(false)

  if (!deveTrocarSenha) return <>{children}</>

  const regras = avaliarSenha(novaSenha)
  const senhasBatem = novaSenha.length > 0 && novaSenha === confirmar
  const forte = senhaEhForte(novaSenha)
  const podeSalvar = !!senhaAtual && forte && senhasBatem

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!podeSalvar) return
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
        setSucesso(true)
        // Pequeno delay para o usuário ver a confirmação, depois recarrega
        setTimeout(() => { router.refresh() }, 800)
      }
    } catch {
      setErro('Erro de rede. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function sair() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const inputClass = 'w-full px-3 py-3 pr-10 rounded-xl text-sm bg-[#F5F5F7] border border-[#D1D1D6] text-[#1D1D1F] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all'

  return (
    <>
      {/* O conteúdo fica atrás, mas inerte (sem interação) */}
      <div className="pointer-events-none blur-sm select-none" aria-hidden>
        {children}
      </div>

      {/* Overlay bloqueante */}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="w-full max-w-[460px] rounded-3xl overflow-hidden"
          style={{
            background: '#FFFFFF',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {/* Header */}
          <div className="px-7 pt-7 pb-5 text-center">
            <div
              className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)' }}
            >
              <ShieldAlert className="w-7 h-7" style={{ color: '#F57C00' }} />
            </div>
            <h2 className="text-xl font-bold tracking-tight" style={{ color: '#1D1D1F' }}>
              Crie uma senha segura
            </h2>
            <p className="text-sm mt-2" style={{ color: '#86868B' }}>
              Você está usando uma senha temporária. Para continuar, defina uma senha forte agora.
            </p>
          </div>

          <form onSubmit={salvar} className="px-7 pb-7 space-y-3">
            {erro && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                   style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{erro}</span>
              </div>
            )}
            {sucesso && (
              <div className="flex items-start gap-2 p-3 rounded-xl text-sm"
                   style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A' }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Senha alterada! Carregando o sistema…</span>
              </div>
            )}

            {/* Senha atual */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#86868B' }}>
                Senha atual
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86868B' }} />
                <input
                  type={mostrarAtual ? 'text' : 'password'}
                  value={senhaAtual}
                  onChange={e => setSenhaAtual(e.target.value)}
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
                  className={inputClass + ' pl-10'}
                  disabled={salvando || sucesso}
                  autoFocus
                />
                <button type="button" tabIndex={-1} onClick={() => setMostrarAtual(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#86868B' }}>
                  {mostrarAtual ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Nova senha */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#86868B' }}>
                Nova senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86868B' }} />
                <input
                  type={mostrarNova ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={e => setNovaSenha(e.target.value)}
                  placeholder="Sua nova senha"
                  autoComplete="new-password"
                  className={inputClass + ' pl-10'}
                  disabled={salvando || sucesso}
                />
                <button type="button" tabIndex={-1} onClick={() => setMostrarNova(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#86868B' }}>
                  {mostrarNova ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Checklist de requisitos — amigável e visual */}
            <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#F5F5F7' }}>
              <Regra ok={regras.minLength}    texto="Pelo menos 8 caracteres" />
              <Regra ok={regras.temMaiuscula} texto="Pelo menos 1 letra MAIÚSCULA (A-Z)" />
              <Regra ok={regras.temMinuscula} texto="Pelo menos 1 letra minúscula (a-z)" />
              <Regra ok={regras.temEspecial}  texto="Pelo menos 1 caractere especial (! @ # $ %)" />
            </div>

            {/* Confirmar */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#86868B' }}>
                Confirme a nova senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86868B' }} />
                <input
                  type={mostrarConf ? 'text' : 'password'}
                  value={confirmar}
                  onChange={e => setConfirmar(e.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                  className={inputClass + ' pl-10'}
                  disabled={salvando || sucesso}
                />
                <button type="button" tabIndex={-1} onClick={() => setMostrarConf(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#86868B' }}>
                  {mostrarConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmar.length > 0 && !senhasBatem && (
                <p className="text-xs" style={{ color: '#DC2626' }}>As senhas não coincidem.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!podeSalvar || salvando || sucesso}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-2 mt-2"
              style={{
                background: (!podeSalvar || salvando || sucesso) ? '#B8B8BF' : '#0071E3',
                color: '#FFFFFF',
                boxShadow: (!podeSalvar || salvando || sucesso) ? 'none' : '0 2px 8px rgba(0,113,227,0.25)',
                cursor: (!podeSalvar || salvando || sucesso) ? 'not-allowed' : 'pointer',
              }}
            >
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar nova senha'}
            </button>

            <button
              type="button"
              onClick={sair}
              className="w-full py-2.5 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
              style={{ color: '#86868B' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#FF3B30' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#86868B' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair do sistema
            </button>
          </form>
        </div>
      </div>
    </>
  )
}

function Regra({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <div className="flex items-center gap-2 text-xs transition-colors" style={{ color: ok ? '#16A34A' : '#86868B' }}>
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
        style={{ background: ok ? '#DCFCE7' : '#E5E5EA' }}
      >
        {ok
          ? <Check className="w-3 h-3" strokeWidth={3} />
          : <XIcon className="w-3 h-3" strokeWidth={2.5} style={{ color: '#B8B8BF' }} />
        }
      </span>
      <span>{texto}</span>
    </div>
  )
}
