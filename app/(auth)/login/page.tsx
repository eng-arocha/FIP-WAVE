'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Waves, Lock, Mail, AlertCircle } from 'lucide-react'

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
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #080C14 0%, #0D1421 50%, #080C14 100%)',
      }}
    >
      {/* Grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(59,130,246,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.03) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Animated floating particles */}
      <div
        className="absolute top-[10%] left-[15%] w-72 h-72 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          animation: 'floatA 18s ease-in-out infinite',
          filter: 'blur(2px)',
        }}
      />
      <div
        className="absolute bottom-[15%] right-[10%] w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)',
          animation: 'floatB 22s ease-in-out infinite',
          filter: 'blur(2px)',
        }}
      />
      <div
        className="absolute top-[55%] left-[5%] w-56 h-56 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          animation: 'floatC 26s ease-in-out infinite',
          filter: 'blur(3px)',
        }}
      />
      <div
        className="absolute top-[20%] right-[20%] w-48 h-48 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
          animation: 'floatD 20s ease-in-out infinite',
          filter: 'blur(3px)',
        }}
      />

      <style>{`
        @keyframes floatA {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -40px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.97); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0, 0) scale(1); }
          40% { transform: translate(-40px, -30px) scale(1.08); }
          70% { transform: translate(25px, 15px) scale(0.95); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(20px, -50px) scale(1.1); }
        }
        @keyframes floatD {
          0%, 100% { transform: translate(0, 0) scale(1); }
          45% { transform: translate(-30px, 30px) scale(0.9); }
        }
      `}</style>

      <div className="w-full max-w-md relative z-10">
        {/* Logo area */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center gap-3 mb-5 px-5 py-3 rounded-2xl"
            style={{
              background: 'rgba(59,130,246,0.10)',
              border: '1px solid rgba(59,130,246,0.20)',
            }}
          >
            <Waves className="w-7 h-7" style={{ color: '#06B6D4' }} />
            <span
              className="text-2xl font-black tracking-widest"
              style={{
                background: 'linear-gradient(90deg, #3B82F6, #06B6D4)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              WAVE
            </span>
          </div>

          <h1
            className="text-4xl font-black tracking-tight mb-2"
            style={{
              background: 'linear-gradient(90deg, #3B82F6 0%, #06B6D4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            FIP-WAVE
          </h1>
          <p className="text-sm" style={{ color: '#94A3B8' }}>
            Gestão de Contratos &amp; Medições
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(17,24,39,0.80)',
            backdropFilter: 'blur(24px)',
            border: '1px solid #1E293B',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.05) inset',
          }}
        >
          <form onSubmit={entrar} className="space-y-5">
            {erro && (
              <div
                className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm"
                style={{
                  background: 'rgba(239,68,68,0.10)',
                  border: '1px solid rgba(239,68,68,0.30)',
                  color: '#FCA5A5',
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#EF4444' }} />
                {erro}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#94A3B8' }}
              >
                E-mail
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: '#475569' }}
                />
                <input
                  id="email"
                  type="email"
                  placeholder="seu@email.com.br"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: '#0D1421',
                    border: '1px solid #1E293B',
                    color: '#F1F5F9',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="senha"
                className="block text-xs font-semibold uppercase tracking-wider"
                style={{ color: '#94A3B8' }}
              >
                Senha
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: '#475569' }}
                />
                <input
                  id="senha"
                  type="password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: '#0D1421',
                    border: '1px solid #1E293B',
                    color: '#F1F5F9',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.10)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#1E293B'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: loading
                  ? 'rgba(59,130,246,0.40)'
                  : 'linear-gradient(90deg, #3B82F6 0%, #06B6D4 100%)',
                color: '#fff',
                boxShadow: loading ? 'none' : '0 0 24px rgba(59,130,246,0.35)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => {
                if (!loading) e.currentTarget.style.boxShadow = '0 0 36px rgba(59,130,246,0.55)'
              }}
              onMouseLeave={e => {
                if (!loading) e.currentTarget.style.boxShadow = '0 0 24px rgba(59,130,246,0.35)'
              }}
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
                'Entrar no Sistema'
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-xs" style={{ color: '#475569' }}>
          Acesso restrito · FIP Engenharia © 2025
        </p>
      </div>
    </div>
  )
}
