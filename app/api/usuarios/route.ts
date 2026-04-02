import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarUsuarios } from '@/lib/db/usuarios'
import { setPermissoesUsuario, TEMPLATES } from '@/lib/db/permissoes'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('perfis').select('perfil').eq('id', user.id).single()
  return data?.perfil === 'admin'
}

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const data = await listarUsuarios()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { nome, email, senha, perfil } = await req.json()
    if (!nome || !email || !senha || !perfil) {
      return NextResponse.json({ error: 'Campos obrigatórios: nome, email, senha, perfil' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Cria o usuário no Supabase Auth (trigger auto-cria o perfil)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, perfil },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    // Garante que o perfil foi criado com os valores corretos
    await admin.from('perfis').upsert({
      id: authData.user.id,
      nome,
      email,
      perfil,
      ativo: true,
    })

    // Aplica template de permissões do perfil automaticamente
    const templateKey = perfil as keyof typeof TEMPLATES
    if (TEMPLATES[templateKey]) {
      await setPermissoesUsuario(authData.user.id, TEMPLATES[templateKey])
    }

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
