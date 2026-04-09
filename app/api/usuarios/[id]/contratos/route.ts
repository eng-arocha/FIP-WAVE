import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'

// GET /api/usuarios/[id]/contratos
// Lista os contratos vinculados a um usuário. Apenas admin.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('usuarios_contratos')
      .select('contrato_id')
      .eq('usuario_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json((data || []).map(d => d.contrato_id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT /api/usuarios/[id]/contratos
// Substitui TODOS os vínculos do usuário pelos passados no body.
// Body: { contrato_ids: string[] }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const contrato_ids: string[] = Array.isArray(body.contrato_ids) ? body.contrato_ids.filter((x: unknown) => typeof x === 'string') : []

    const admin = createAdminClient()

    // Delete + insert em transação lógica (não é atomic, mas a ordem minimiza janela de inconsistência)
    const { error: delErr } = await admin
      .from('usuarios_contratos')
      .delete()
      .eq('usuario_id', id)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    if (contrato_ids.length > 0) {
      const rows = contrato_ids.map(contrato_id => ({ usuario_id: id, contrato_id }))
      const { error: insErr } = await admin.from('usuarios_contratos').insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, total: contrato_ids.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
