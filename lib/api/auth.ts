import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEMPLATES } from '@/lib/permissoes-config'

// Verifica se o usuário logado é admin usando o admin client (ignora RLS)
export async function assertAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const admin = createAdminClient()
    const { data } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
    return data?.perfil === 'admin'
  } catch {
    return false
  }
}

/**
 * Retorna o usuário logado (auth) ou null se não autenticado.
 * Helper único para evitar repetir o boilerplate de cookies/getUser.
 */
export async function getUsuarioLogado() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  } catch {
    return null
  }
}

/**
 * Verifica se o usuário logado tem uma permissão específica (modulo+acao).
 *
 * Ordem de verificação:
 *   1) Admin SEMPRE passa.
 *   2) Permissão explícita na tabela `permissoes_usuario` → passa.
 *   3) Fallback: template padrão do perfil do usuário
 *      (TEMPLATES[user.perfil]) — cobre usuários antigos criados antes de
 *      uma migration adicionar a permissão ao template, e que nunca
 *      tiveram suas permissões manualmente ajustadas pelo admin.
 *   4) Caso contrário, nega.
 *
 * Tradeoff conhecido: se um admin REMOVER explicitamente uma permissão
 * que está no template padrão, o fallback #3 vai devolver a permissão.
 * Para negar de verdade, o admin precisa (a) mudar o perfil do usuário
 * ou (b) usar um template customizado via templates_permissao.
 *
 * Retorna { ok: false } se não autenticado ou sem permissão.
 * Retorna { ok: true, userId, userEmail, isAdmin } caso contrário.
 */
export async function assertPermissao(modulo: string, acao: string): Promise<
  { ok: true; userId: string; userEmail: string | null; isAdmin: boolean }
  | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getUsuarioLogado()
  if (!user) return { ok: false, status: 401, error: 'Não autenticado' }

  const admin = createAdminClient()

  // Lê o perfil do usuário (admin / engenheiro_fip / visualizador / etc.)
  const { data: perfil } = await admin
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  // 1) Admin SEMPRE pode
  if (perfil?.perfil === 'admin') {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: true }
  }

  // 2) Permissão explícita na tabela
  const { data: perms } = await admin
    .from('permissoes_usuario')
    .select('modulo')
    .eq('user_id', user.id)
    .eq('modulo', modulo)
    .eq('acao', acao)
    .limit(1)

  if (perms && perms.length > 0) {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: false }
  }

  // 3) Fallback: template padrão do perfil
  const perfilTipo = (perfil?.perfil ?? 'visualizador') as keyof typeof TEMPLATES
  const templatePerms = TEMPLATES[perfilTipo] ?? []
  const noTemplate = templatePerms.some(p => p.modulo === modulo && p.acao === acao)
  if (noTemplate) {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: false }
  }

  // 4) Nega
  return { ok: false, status: 403, error: `Sem permissão para ${acao} em ${modulo}` }
}
