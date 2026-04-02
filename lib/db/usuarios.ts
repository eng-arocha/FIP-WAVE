import { createClient } from '@/lib/supabase/server'

export async function getPerfil(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
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
