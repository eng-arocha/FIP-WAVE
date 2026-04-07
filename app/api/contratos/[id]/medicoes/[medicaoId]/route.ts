import { NextResponse } from 'next/server'
import { getMedicao } from '@/lib/db/medicoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const ADMIN_EMAILS = ['eng.arocha@gmail.com']

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (ADMIN_EMAILS.includes(user.email ?? '')) return user
  const admin = createAdminClient()
  const { data } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
  return data?.perfil === 'admin' ? user : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const { medicaoId } = await params
    return NextResponse.json(await getMedicao(medicaoId))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH: desaprovar (volta para submetido)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const user = await checkAdmin()
    if (!user) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })

    const { medicaoId } = await params
    const { status } = await req.json()

    const admin = createAdminClient()
    const { error } = await admin
      .from('medicoes')
      .update({ status, aprovador_nome: null, aprovador_email: null, data_aprovacao: null })
      .eq('id', medicaoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE: excluir medição
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const user = await checkAdmin()
    if (!user) return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })

    const { medicaoId } = await params
    const admin = createAdminClient()

    await admin.from('medicao_itens').delete().eq('medicao_id', medicaoId)
    await admin.from('medicao_anexos').delete().eq('medicao_id', medicaoId)
    await admin.from('medicao_aprovacoes').delete().eq('medicao_id', medicaoId)
    const { error } = await admin.from('medicoes').delete().eq('id', medicaoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
