import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { isSenhaPadrao } from '@/lib/auth/senha'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    // Nome único (excluindo o próprio registro)
    if (body.nome !== undefined) {
      const nomeNormalizado = String(body.nome).trim()
      const { data: existentes } = await admin
        .from('perfis')
        .select('id')
        .ilike('nome', nomeNormalizado)
        .neq('id', id)
        .limit(1)
      if (existentes && existentes.length > 0) {
        return NextResponse.json(
          { error: `Já existe outro usuário com o nome "${nomeNormalizado}". Use um nome único para manter a rastreabilidade.` },
          { status: 409 }
        )
      }
    }

    // Atualizamos a tabela perfis em DUAS chamadas separadas:
    //   (1) campos "core" (nome, perfil, ativo, deve_trocar_senha) — sempre presentes
    //   (2) campos "opcionais" que dependem de migrations posteriores
    //       (template_id da migration 012, deve_trocar_senha da 022)
    // Se a coluna opcional não existir no schema cache do PostgREST, fazemos
    // fallback gracioso e seguimos a vida — sem 400 para o usuário final.
    const coreUpdates: Record<string, unknown> = {}
    if (body.nome   !== undefined) coreUpdates.nome   = body.nome
    if (body.perfil !== undefined) coreUpdates.perfil = body.perfil
    if (body.ativo  !== undefined) coreUpdates.ativo  = body.ativo

    if (Object.keys(coreUpdates).length > 0) {
      const { error } = await admin.from('perfis').update(coreUpdates).eq('id', id)
      if (error) return apiError(error, { status: 400 })
    }

    // Atualiza template_id em chamada separada (tolera coluna ausente)
    if (body.template_id !== undefined) {
      const { error } = await admin.from('perfis')
        .update({ template_id: body.template_id || null })
        .eq('id', id)
      if (error && !isSchemaMissingError(error, ['template_id'])) {
        return apiError(error, { status: 400 })
      }
      // Se o erro foi sobre template_id, ignora — provavelmente a migration
      // 012 / 024 ainda não rodou no Supabase. O perfil base já foi salvo.
    }

    // Atualiza deve_trocar_senha em chamada separada (tolera coluna ausente)
    if (body.nova_senha && isSenhaPadrao(body.nova_senha)) {
      const { error } = await admin.from('perfis')
        .update({ deve_trocar_senha: true })
        .eq('id', id)
      if (error && !isSchemaMissingError(error, ['deve_trocar_senha'])) {
        return apiError(error, { status: 400 })
      }
    }

    // Atualiza permissões se fornecidas
    if (body.permissoes_custom && Array.isArray(body.permissoes_custom) && body.permissoes_custom.length > 0) {
      const { setPermissoesUsuario } = await import('@/lib/db/permissoes')
      await setPermissoesUsuario(id, body.permissoes_custom)
    }

    // Atualiza senha se fornecida
    if (body.nova_senha) {
      const { error: authError } = await admin.auth.admin.updateUserById(id, { password: body.nova_senha })
      if (authError) return apiError(authError, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const admin = createAdminClient()
    // Exclui permanentemente do Supabase Auth (cascateia para perfis via FK)
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) return apiError(error, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
