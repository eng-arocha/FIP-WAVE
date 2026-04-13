import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

// POST /api/auth/marcar-troca-senha
// Marca o usuário logado como "deve trocar a senha".
// Chamado pelo fluxo de login quando o usuário entrou com a senha padrão.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('perfis')
    .update({ deve_trocar_senha: true })
    .eq('id', user.id)

  if (error) return apiError(error)
  return NextResponse.json({ ok: true })
}
