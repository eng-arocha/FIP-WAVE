import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarSenhaForte } from '@/lib/auth/senha'

// PUT /api/auth/alterar-senha
// Permite que o usuário autenticado troque a própria senha.
// Verifica a senha atual antes de atualizar e exige senha forte.
export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const senha_atual = typeof body.senha_atual === 'string' ? body.senha_atual : ''
    const nova_senha  = typeof body.nova_senha  === 'string' ? body.nova_senha  : ''

    if (!senha_atual || !nova_senha) {
      return NextResponse.json({ error: 'Informe a senha atual e a nova senha.' }, { status: 400 })
    }
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
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // 4) Limpa a flag deve_trocar_senha — a troca obrigatória foi cumprida
    await admin
      .from('perfis')
      .update({ deve_trocar_senha: false })
      .eq('id', user.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}
