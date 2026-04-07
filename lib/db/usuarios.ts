import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getPerfil(userId: string) {
  // Usa admin client para ignorar RLS e garantir leitura do perfil
  const admin = createAdminClient()
  const { data } = await admin
    .from('perfis')
    .select('id, nome, email, perfil, ativo')
    .eq('id', userId)
    .single()
  return data
}

export async function getPerfilDoUsuarioLogado() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return getPerfil(user.id)
}

export async function listarUsuarios() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('perfis')
    .select('id, nome, email, perfil, ativo, criado_em')
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data || []
}
