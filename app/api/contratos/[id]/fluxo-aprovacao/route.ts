import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * GET — lista os níveis de aprovação configurados para o contrato.
 * PUT — substitui o fluxo (envia array completo).
 *
 * Permissão: aprovacoes.aprovar.
 *
 * Exemplo body PUT:
 *   { niveis: [
 *       { nivel: 1, papel: 'engenheiro_fiscal', ordem: 1, perfil_required: 'engenheiro_fip', obrigatorio: true },
 *       { nivel: 2, papel: 'coordenador',       ordem: 2, perfil_required: null,             obrigatorio: true },
 *       { nivel: 3, papel: 'cliente_final',     ordem: 3, perfil_required: null,             obrigatorio: false }
 *   ]}
 */
const Nivel = z.object({
  nivel:           z.number().int().min(1).max(5),
  papel:           z.string().min(1).max(100),
  perfil_required: z.string().max(100).nullable().optional(),
  obrigatorio:     z.boolean().default(true),
  ordem:           z.number().int().min(1).max(5),
})

const Body = z.object({
  niveis: z.array(Nivel).min(1).max(5),
})

const ParamsSchema = z.object({ id: uuid() })

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('fluxo_aprovacao_contrato')
      .select('*')
      .eq('contrato_id', id)
      .order('ordem')
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Permissão necessária pra editar o fluxo de aprovação.' },
        { status: check.status },
      )
    }

    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { niveis } = parsed.data

    const admin = createAdminClient()

    // Substitui o fluxo (DELETE + INSERT em transação implícita)
    const { error: delErr } = await admin
      .from('fluxo_aprovacao_contrato')
      .delete()
      .eq('contrato_id', id)
    if (delErr) throw delErr

    const inserts = niveis.map(n => ({
      contrato_id: id,
      nivel: n.nivel,
      papel: n.papel,
      perfil_required: n.perfil_required ?? null,
      obrigatorio: n.obrigatorio,
      ordem: n.ordem,
    }))
    const { error: insErr } = await admin
      .from('fluxo_aprovacao_contrato')
      .insert(inserts)
    if (insErr) throw insErr

    await audit({
      event: 'contrato.fluxo_aprovacao_atualizado',
      entity_type: 'contrato',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      after: { niveis },
      request: req,
    })

    return NextResponse.json({ ok: true, niveis: inserts })
  } catch (e: any) {
    return apiError(e)
  }
}
