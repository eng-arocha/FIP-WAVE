import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'

/**
 * Conta quantos usuários SERIAM afetados por uma mudança neste template:
 * template_id = X AND permissoes_customizadas = false.
 * Usuários com a flag de customizadas ficam de fora (ilha).
 */
async function contarUsuariosAfetados(templateId: string): Promise<number> {
  const admin = createAdminClient()
  // Tenta com a flag (migration 026). Se a coluna não existe, cai para o
  // count só por template_id (migration 012).
  const r1 = await admin
    .from('perfis')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
    .eq('permissoes_customizadas', false)

  if (!r1.error) return r1.count ?? 0

  if (/permissoes_customizadas/.test(r1.error.message)) {
    const r2 = await admin
      .from('perfis')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', templateId)
    return r2.count ?? 0
  }

  return 0
}

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

    // Conta quantos usuários recebem essa mudança automaticamente
    // (herdam deste template sem customização própria)
    const usuarios_afetados = await contarUsuariosAfetados(id)

    return NextResponse.json({ ...data, usuarios_afetados })
  } catch (e: any) {
    return apiError(e)
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

    // Bloqueia se houver usuários ligados (qualquer um, customizado ou não)
    const { count: total } = await admin
      .from('perfis')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id)

    if ((total ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Não é possível excluir: ${total} usuário(s) estão usando este perfil. Reatribua-os a outro perfil antes de excluir.`,
          usuarios_ligados: total,
        },
        { status: 409 }
      )
    }

    const { error } = await admin.from('templates_permissao').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
