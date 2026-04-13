import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listarUsuarios } from '@/lib/db/usuarios'
import { setPermissoesUsuario } from '@/lib/db/permissoes'
import { assertAdmin } from '@/lib/api/auth'
import { isSenhaPadrao } from '@/lib/auth/senha'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const admin = createAdminClient()
    // Traz também template_id + nome do template para a UI mostrar o rótulo
    // correto quando o usuário está ligado a um template customizado.
    // Tenta com o join; se falhar (migration 012 não aplicada ou schema cache
    // sem FK), cai para o select legado sem o join.
    let { data, error } = await admin
      .from('perfis')
      .select('id, nome, email, perfil, ativo, criado_em, template_id, permissoes_customizadas, template:templates_permissao(id, nome)')
      .order('criado_em', { ascending: false })

    if (error && isSchemaMissingError(error, ['template_id', 'templates_permissao', 'permissoes_customizadas'])) {
      const fb = await admin
        .from('perfis')
        .select('id, nome, email, perfil, ativo, criado_em')
        .order('criado_em', { ascending: false })
      data = fb.data as any
      error = fb.error as any
    }

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
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
    if (authError) return apiError(authError, { status: 400 })

    // Garante que o perfil foi criado com os valores corretos.
    // Faz upsert em duas tentativas para tolerar colunas opcionais ausentes
    // (template_id da migration 012, deve_trocar_senha da 022).
    const perfilCore: Record<string, unknown> = {
      id: authData.user.id,
      nome,
      email,
      perfil: perfilEfetivo,
      ativo: true,
    }
    const perfilExtras: Record<string, unknown> = {}
    if (template_id) perfilExtras.template_id = template_id
    if (isSenhaPadrao(senha)) perfilExtras.deve_trocar_senha = true

    // Tentativa 1: tudo junto
    let upsertOk = false
    if (Object.keys(perfilExtras).length > 0) {
      const { error } = await admin.from('perfis').upsert({ ...perfilCore, ...perfilExtras })
      if (!error) upsertOk = true
      else if (!isSchemaMissingError(error, ['template_id', 'deve_trocar_senha'])) {
        return apiError(error, { status: 400 })
      }
      // se o erro foi sobre coluna opcional, cai para o fallback
    }

    if (!upsertOk) {
      // Fallback: salva só os campos core
      const { error } = await admin.from('perfis').upsert(perfilCore)
      if (error) return apiError(error, { status: 400 })
    }

    // Novo modelo: usuários criados herdam do template automaticamente
    // (resolução LIVE via getPermissoesEfetivas). Não precisamos mais
    // copiar as permissões para permissoes_usuario no momento da criação.
    // permissoes_customizadas começa como false por padrão (da coluna).
    //
    // Se o frontend mandar um array permissoes_custom explícito
    // (ex: admin quis criar o usuário já com uma ilha customizada),
    // ainda damos suporte. Isso seta a flag true via PUT /permissoes.
    if (permissoes_custom && Array.isArray(permissoes_custom) && permissoes_custom.length > 0) {
      await setPermissoesUsuario(authData.user.id, permissoes_custom)
      // Marca como ilha customizada
      await admin.from('perfis')
        .update({ permissoes_customizadas: true })
        .eq('id', authData.user.id)
    }
    // Caso contrário: não mexe em permissoes_usuario. O resolver vai ler
    // do template_id vinculado automaticamente.

    return NextResponse.json({ id: authData.user.id }, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}
