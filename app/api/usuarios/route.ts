import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarUsuarios } from '@/lib/db/usuarios'
import { setPermissoesUsuario, TEMPLATES } from '@/lib/db/permissoes'
import { assertAdmin } from '@/lib/api/auth'
import { isSenhaPadrao } from '@/lib/auth/senha'

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('perfis')
      .select('id, nome, email, perfil, ativo, criado_em')
      .order('criado_em', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { nome, email, senha, perfil, template_id, permissoes_custom } = await req.json()
    if (!nome || !email || !senha) {
      return NextResponse.json({ error: 'Campos obrigatórios: nome, email, senha' }, { status: 400 })
    }

    // perfil efetivo: usa o passado ou fallback para visualizador
    const perfilEfetivo = perfil || 'visualizador'
    const admin = createAdminClient()

    // Impede nome duplicado — cada usuário precisa ser rastreável por nome
    const nomeNormalizado = String(nome).trim()
    const { data: existentes } = await admin
      .from('perfis')
      .select('id')
      .ilike('nome', nomeNormalizado)
      .limit(1)
    if (existentes && existentes.length > 0) {
      return NextResponse.json(
        { error: `Já existe um usuário com o nome "${nomeNormalizado}". Use um nome único para manter a rastreabilidade.` },
        { status: 409 }
      )
    }

    // Cria o usuário no Supabase Auth
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, perfil: perfilEfetivo },
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

    // Garante que o perfil foi criado com os valores corretos
    const perfilUpsert: Record<string, unknown> = {
      id: authData.user.id,
      nome,
      email,
      perfil: perfilEfetivo,
      ativo: true,
      // Se o admin criou com a senha padrão, força troca no primeiro acesso
      deve_trocar_senha: isSenhaPadrao(senha),
    }
    if (template_id) perfilUpsert.template_id = template_id
    await admin.from('perfis').upsert(perfilUpsert)

    // Aplica permissões: custom (do template DB) > hardcoded TEMPLATES
    if (permissoes_custom && Array.isArray(permissoes_custom) && permissoes_custom.length > 0) {
      await setPermissoesUsuario(authData.user.id, permissoes_custom)
    } else {
      const templateKey = perfilEfetivo as keyof typeof TEMPLATES
      if (TEMPLATES[templateKey]) await setPermissoesUsuario(authData.user.id, TEMPLATES[templateKey])
    }

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
