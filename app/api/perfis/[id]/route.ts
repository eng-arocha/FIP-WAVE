import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const { nome, descricao, permissoes } = await req.json()
    const admin = createAdminClient()

    // Não permite alterar nome de perfis do sistema
    const { data: existing } = await admin
      .from('templates_permissao')
      .select('sistema')
      .eq('id', id)
      .single()

    const updateData: Record<string, unknown> = { permissoes }
    if (!existing?.sistema) {
      if (nome) updateData.nome = nome
      if (descricao !== undefined) updateData.descricao = descricao
    }

    const { data, error } = await admin
      .from('templates_permissao')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const admin = createAdminClient()

    const { data: existing } = await admin
      .from('templates_permissao')
      .select('sistema')
      .eq('id', id)
      .single()

    if (existing?.sistema) {
      return NextResponse.json({ error: 'Perfis nativos do sistema não podem ser excluídos' }, { status: 400 })
    }

    const { error } = await admin.from('templates_permissao').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
