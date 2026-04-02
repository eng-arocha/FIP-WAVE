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
