import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Permissao } from '@/lib/permissoes-config'
import { MODULOS_CONFIG, TEMPLATES } from '@/lib/permissoes-config'

export { MODULOS_CONFIG, TEMPLATES }
export type { Permissao }

export async function getPermissoesUsuario(userId: string): Promise<Permissao[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('permissoes_usuario')
    .select('modulo, acao')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

export async function getPermissoesDoUsuarioLogado(): Promise<Permissao[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  return getPermissoesUsuario(user.id)
}

export async function setPermissoesUsuario(userId: string, permissoes: Permissao[]): Promise<void> {
  const admin = createAdminClient()
  const { error: del } = await admin.from('permissoes_usuario').delete().eq('user_id', userId)
  if (del) throw del
  if (permissoes.length === 0) return
  const { error: ins } = await admin.from('permissoes_usuario').insert(
    permissoes.map(p => ({ user_id: userId, modulo: p.modulo, acao: p.acao }))
  )
  if (ins) throw ins
}
