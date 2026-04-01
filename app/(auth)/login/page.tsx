'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Building2, Lock, Mail, AlertCircle } from 'lucide-react'

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
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a5f] to-[#2d5a8e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">FIP Gestão de Medições</h1>
          <p className="text-blue-200 text-sm mt-1">Controle de Contratos e Medições</p>
        </div>
        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-gray-800">Acesso ao Sistema</CardTitle>
            <CardDescription>Entre com seu e-mail e senha cadastrados</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={entrar} className="space-y-4">
              {erro && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {erro}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input id="email" type="email" placeholder="seu@email.com.br" className="pl-9" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input id="senha" type="password" placeholder="••••••••" className="pl-9" value={senha} onChange={e => setSenha(e.target.value)} required />
                </div>
              </div>
              <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#2d5a8e]" loading={loading}>
                Entrar no Sistema
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-blue-200/60 text-xs mt-6">FIP Engenharia © 2025 — v1.0</p>
      </div>
    </div>
  )
}
