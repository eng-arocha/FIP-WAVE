import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase/env'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarSenhaForte } from '@/lib/auth/senha'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'

const Body = z.object({
  senha_atual: z.string().min(1, 'Informe a senha atual.'),
  nova_senha: z.string().min(1, 'Informe a nova senha.').max(200),
})

// PUT /api/auth/alterar-senha
// Permite que o usuário autenticado troque a própria senha.
// Verifica a senha atual antes de atualizar e exige senha forte.
export async function PUT(req: Request) {
  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { senha_atual, nova_senha } = parsed.data

    const erroForte = validarSenhaForte(nova_senha)
    if (erroForte) {
      return NextResponse.json({ error: erroForte }, { status: 400 })
    }
    if (senha_atual === nova_senha) {
      return NextResponse.json({ error: 'A nova senha deve ser diferente da atual.' }, { status: 400 })
    }

    // 1) Usuário logado
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) {
      return NextResponse.json({ error: 'Sessão inválida. Faça login novamente.' }, { status: 401 })
    }

    // 2) Verifica a senha atual usando um client isolado
    //    (não persiste sessão, não afeta os cookies atuais)
    const verifier = createSbClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { error: signInError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password: senha_atual,
    })
    if (signInError) {
      return NextResponse.json({ error: 'Senha atual incorreta.' }, { status: 401 })
    }

    // 3) Atualiza a senha via admin (service role)
    const admin = createAdminClient()
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: nova_senha,
    })
    if (updateError) {
      return apiError(updateError, { status: 400 })
    }

    // 4) Limpa a flag deve_trocar_senha — a troca obrigatória foi cumprida
    await admin
      .from('perfis')
      .update({ deve_trocar_senha: false })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
