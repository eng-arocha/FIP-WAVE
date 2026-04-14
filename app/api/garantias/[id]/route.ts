import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, dataIso } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * PATCH — atualiza garantia (renovar vencimento, marcar liberada, etc).
 * DELETE — soft-delete (ativa = false). Não apaga histórico.
 */
const PatchBody = z.object({
  data_vencimento: dataIso().optional(),
  data_liberacao: dataIso().optional(),
  ativa: z.boolean().optional(),
  observacoes: z.string().max(2000).optional(),
  url_documento: z.string().url().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Permissão necessária.' }, { status: check.status })
    }

    const { id } = await params
    const parsed = await parseBody(PatchBody, req)
    if (!parsed.ok) return parsed.res

    const admin = createAdminClient()
    const { data: before } = await admin
      .from('garantias_contratuais')
      .select('*')
      .eq('id', id)
      .single()

    const { data, error } = await admin
      .from('garantias_contratuais')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error

    await audit({
      event: 'garantia.atualizada',
      entity_type: 'garantia_contratual',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before,
      after: data,
      request: req,
    })

    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json({ error: 'Permissão necessária.' }, { status: check.status })
    }

    const { id } = await params
    const admin = createAdminClient()
    // Soft-delete (ativa=false) preserva histórico
    const { error } = await admin
      .from('garantias_contratuais')
      .update({ ativa: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    await audit({
      event: 'garantia.desativada',
      entity_type: 'garantia_contratual',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      request: req,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
