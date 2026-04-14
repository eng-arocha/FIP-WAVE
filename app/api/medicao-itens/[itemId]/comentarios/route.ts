import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioLogado } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

const Body = z.object({
  texto: z.string().trim().min(1, 'Digite uma mensagem.').max(2000),
  tipo: z.enum(['comentario', 'ajuste_solicitado', 'aceito']).default('comentario'),
})

const ParamsSchema = z.object({ itemId: uuid() })

/**
 * GET — lista comentários do item, mais recentes primeiro.
 * POST — adiciona novo comentário/ajuste/aceito.
 *
 * Autoria capturada da SESSÃO (não do body) — segurança.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const { itemId } = await params
    const valid = ParamsSchema.safeParse({ itemId })
    if (!valid.success) return NextResponse.json({ error: 'itemId inválido' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('medicao_item_comentarios')
      .select('*')
      .eq('medicao_item_id', itemId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  try {
    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { itemId } = await params
    const valid = ParamsSchema.safeParse({ itemId })
    if (!valid.success) return NextResponse.json({ error: 'itemId inválido' }, { status: 400 })

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { texto, tipo } = parsed.data

    const admin = createAdminClient()

    // Recupera nome do perfil (deriva da sessão)
    const { data: perfil } = await admin
      .from('perfis')
      .select('nome, email')
      .eq('id', user.id)
      .single()

    const { data, error } = await admin
      .from('medicao_item_comentarios')
      .insert({
        medicao_item_id: itemId,
        autor_id: user.id,
        autor_nome: perfil?.nome ?? user.email ?? 'Usuário',
        autor_email: perfil?.email ?? user.email ?? null,
        tipo,
        texto,
      })
      .select()
      .single()
    if (error) throw error

    await audit({
      event: `medicao_item.${tipo}`,
      entity_type: 'medicao_item',
      entity_id: itemId,
      actor_id: user.id,
      actor_nome: perfil?.nome ?? null,
      actor_email: perfil?.email ?? user.email ?? null,
      metadata: { texto, comentario_id: data.id },
      request: req,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}
