import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioLogado } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { audit } from '@/lib/api/audit'

const ParamsSchema = z.object({ commentId: z.string().uuid() })

/**
 * POST — marca um ajuste_solicitado como resolvido (cliente atendeu).
 * Apenas o autor do comentário ou admin pode resolver.
 */
export async function POST(req: Request, { params }: { params: Promise<{ commentId: string }> }) {
  try {
    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { commentId } = await params
    if (!ParamsSchema.safeParse({ commentId }).success) {
      return NextResponse.json({ error: 'commentId inválido' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: existing, error: getErr } = await admin
      .from('medicao_item_comentarios')
      .select('autor_id, resolvido')
      .eq('id', commentId)
      .single()
    if (getErr || !existing) {
      return NextResponse.json({ error: 'Comentário não encontrado' }, { status: 404 })
    }

    // Permissão: autor ou admin
    const { data: perfil } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
    const isAdmin = perfil?.perfil === 'admin'
    if (existing.autor_id !== user.id && !isAdmin) {
      return NextResponse.json({ error: 'Apenas o autor ou um admin pode marcar como resolvido.' }, { status: 403 })
    }
    if (existing.resolvido) {
      return NextResponse.json({ ok: true, alreadyResolved: true })
    }

    const { error: upErr } = await admin
      .from('medicao_item_comentarios')
      .update({ resolvido: true, resolvido_em: new Date().toISOString(), resolvido_por: user.id })
      .eq('id', commentId)
    if (upErr) throw upErr

    await audit({
      event: 'medicao_item.comentario_resolvido',
      entity_type: 'medicao_item_comentario',
      entity_id: commentId,
      actor_id: user.id,
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
