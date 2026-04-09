'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isSenhaPadrao } from '@/lib/auth/senha'
import { Lock, Mail, AlertCircle, ArrowRight } from 'lucide-react'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) { setErro('E-mail ou senha inválidos. Tente novamente.'); setLoading(false); return }

    // Se o usuário entrou com a senha padrão, marca a flag para forçar troca
    // no próximo carregamento (o layout autenticado bloqueia a UI até trocar).
    if (isSenhaPadrao(senha)) {
      try { await fetch('/api/auth/marcar-troca-senha', { method: 'POST' }) } catch {}
    }

    router.push('/dashboard')
    router.refresh()
  }

  const inputStyle = {
    background: '#F5F5F7',
    border: '1px solid #D1D1D6',
    color: '#1D1D1F',
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#F5F5F7' }}>
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-2xl" style={{ background: 'white', boxShadow: '0 2px 16px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)' }}>
              <Image
                src="/logos/Wave.png"
                alt="WAVE"
                width={160}
                height={90}
                priority
                className="object-contain"
                style={{ width: 'auto', height: 'auto', maxWidth: 140, maxHeight: 80 }}
              />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: '#1D1D1F' }}>
            Instalações WAVE
          </h1>
          <p className="text-sm" style={{ color: '#86868B' }}>
            Gestão de Contratos & Medições
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#FFFFFF',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          <form onSubmit={entrar} className="space-y-5">
            {erro && (
              <div
                className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {erro}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#86868B' }}>
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86868B' }} />
                <input
                  id="email"
                  type="email"
                  placeholder="seu@email.com.br"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0071E3'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,113,227,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#D1D1D6'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="senha" className="block text-xs font-semibold uppercase tracking-wider" style={{ color: '#86868B' }}>
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#86868B' }} />
                <input
                  id="senha"
                  type="password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0071E3'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(0,113,227,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#D1D1D6'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: loading ? '#B8B8BF' : '#0071E3',
                color: '#FFFFFF',
                boxShadow: loading ? 'none' : '0 2px 8px rgba(0,113,227,0.25)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#0077ED' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0071E3' }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Entrando...
                </>
              ) : (
                <>
                  Entrar no Sistema
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 px-2">
          <Image src="/logos/fip-logo.svg" alt="FIP Engenharia" width={80} height={24} className="opacity-50" style={{ height: 20, width: 'auto' }} />
          <p className="text-[11px]" style={{ color: '#86868B' }}>© 2025</p>
        </div>
      </div>
    </div>
  )
}
