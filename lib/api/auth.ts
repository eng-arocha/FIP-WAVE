import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPermissoesEfetivas } from '@/lib/db/permissoes'

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
 * Delega a resolução para `getPermissoesEfetivas` (lib/db/permissoes.ts),
 * que aplica a seguinte ordem:
 *   1) Admin → TODAS as permissões (bypass)
 *   2) permissoes_customizadas = true → lê permissoes_usuario (ilha)
 *   3) template_id != null → lê templates_permissao.permissoes (LIVE)
 *   4) Fallback emergencial → TEMPLATES hardcoded
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

  const { permissoes, fonte } = await getPermissoesEfetivas(user.id)
  const isAdmin = fonte === 'admin'

  if (isAdmin) {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: true }
  }

  const tem = permissoes.some(p => p.modulo === modulo && p.acao === acao)
  if (tem) {
    return { ok: true, userId: user.id, userEmail: user.email ?? null, isAdmin: false }
  }

  return { ok: false, status: 403, error: `Sem permissão para ${acao} em ${modulo}` }
}
