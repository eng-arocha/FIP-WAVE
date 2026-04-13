import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withSchemaFallback } from '@/lib/db/resilient'

export async function getPerfil(userId: string): Promise<any> {
  // Usa admin client para ignorar RLS e garantir leitura do perfil.
  // Tenta primeiro com deve_trocar_senha (migration 022). Se a coluna ainda
  // não existir no schema cache, faz fallback para o select sem ela.
  //
  // Tipo de retorno propositalmente `any` — o campo `perfil` é consumido em
  // vários sites como union literal ('admin' | 'engenheiro_fip' | ...),
  // e tipar estritamente como `string` aqui quebra atribuições upstream.
  const admin = createAdminClient()
  const { data } = await withSchemaFallback({
    context: 'getPerfil',
    missingColumns: ['deve_trocar_senha'],
    primary:  () => admin.from('perfis').select('id, nome, email, perfil, ativo, deve_trocar_senha').eq('id', userId).single(),
    fallback: () => admin.from('perfis').select('id, nome, email, perfil, ativo').eq('id', userId).single(),
  })
  return data as any
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
