import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('perfis').select('perfil').eq('id', user.id).single()
  return data?.perfil === 'admin'
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    const updates: Record<string, unknown> = {}
    if (body.nome !== undefined) updates.nome = body.nome
    if (body.perfil !== undefined) updates.perfil = body.perfil
    if (body.ativo !== undefined) updates.ativo = body.ativo

    const { error } = await admin.from('perfis').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Atualiza senha se fornecida
    if (body.nova_senha) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, { password: body.nova_senha })
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const admin = createAdminClient()
    // Desativa ao invés de deletar (preserva histórico)
    const { error } = await admin.from('perfis').update({ ativo: false }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
