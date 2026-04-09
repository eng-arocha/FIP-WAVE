import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/auth/meus-contratos
// Retorna os contratos vinculados ao usuário logado (com numero + descricao).
// Admin recebe TODOS os contratos ativos (pode medir qualquer um).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Checa o perfil
  const { data: perfil } = await admin
    .from('perfis')
    .select('perfil')
    .eq('id', user.id)
    .single()

  const isAdmin = perfil?.perfil === 'admin'

  if (isAdmin) {
    // Admin vê todos os contratos ativos
    const { data, error } = await admin
      .from('contratos')
      .select('id, numero, descricao, status')
      .eq('status', 'ativo')
      .order('numero')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  }

  // Não-admin: só os vinculados
  const { data: vinculos, error: vincError } = await admin
    .from('usuarios_contratos')
    .select('contrato_id')
    .eq('usuario_id', user.id)
  if (vincError) return NextResponse.json({ error: vincError.message }, { status: 500 })

  const ids = (vinculos || []).map(v => v.contrato_id)
  if (ids.length === 0) return NextResponse.json([])

  const { data, error } = await admin
    .from('contratos')
    .select('id, numero, descricao, status')
    .in('id', ids)
    .order('numero')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
