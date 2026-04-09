import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { isSenhaPadrao } from '@/lib/auth/senha'

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
    if (body.template_id !== undefined) updates.template_id = body.template_id || null

    // Se o admin definiu uma nova senha padrão, força troca no próximo acesso
    if (body.nova_senha && isSenhaPadrao(body.nova_senha)) {
      updates.deve_trocar_senha = true
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await admin.from('perfis').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Atualiza permissões se fornecidas
    if (body.permissoes_custom && Array.isArray(body.permissoes_custom) && body.permissoes_custom.length > 0) {
      const { setPermissoesUsuario } = await import('@/lib/db/permissoes')
      await setPermissoesUsuario(id, body.permissoes_custom)
    }

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
    // Exclui permanentemente do Supabase Auth (cascateia para perfis via FK)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
