import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
 * Admin SEMPRE passa.
 * Para os demais perfis, consulta a tabela `permissoes_usuario` (que é a
 * fonte de verdade — pode ter sido editada por admin).
 *
 * Retorna { ok: false } se não autenticado ou sem permissão.
 * Retorna { ok: true, user, isAdmin } caso contrário.
 */
export async function assertPermissao(modulo: string, acao: string): Promise<
  { ok: true; userId: string; userEmail: string | null; isAdmin: boolean }
  | { ok: false; status: 401 | 403; error: string }
> {
  const user = await getUsuarioLogado()
  if (!user) return { ok: false, status: 401, error: 'Não autenticado' }

  const admin = createAdminClient()

  // Admin sempre pode
  const { data: perfil } = await admin
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  if (perfil?.perfil === 'admin') {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: true }
  }

  // Permissão explícita
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

  return { ok: false, status: 403, error: `Sem permissão para ${acao} em ${modulo}` }
}
