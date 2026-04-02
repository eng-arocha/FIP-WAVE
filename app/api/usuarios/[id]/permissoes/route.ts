import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPermissoesUsuario, setPermissoesUsuario } from '@/lib/db/permissoes'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase.from('perfis').select('perfil').eq('id', user.id).single()
  return data?.perfil === 'admin'
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    return NextResponse.json(await getPermissoesUsuario(id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const { permissoes } = await req.json()
    if (!Array.isArray(permissoes)) {
      return NextResponse.json({ error: 'permissoes deve ser um array' }, { status: 400 })
    }
    await setPermissoesUsuario(id, permissoes)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
