import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/contratos/[id]/medicoes/[medicaoId]/itens/[itemId]/confirmar-sem-nf
 *
 * Toggle do flag `confirmacao_sem_nf` em um `medicao_itens`.
 *
 * Body:
 *   { confirmar: boolean, motivo?: string }
 *
 * Comportamento:
 *   - confirmar=true:
 *       confirmacao_sem_nf      = true
 *       confirmacao_sem_nf_em   = NOW()
 *       confirmacao_sem_nf_por_id = (user logado, vindo da SESSÃO)
 *       confirmacao_sem_nf_motivo = body.motivo ?? motivo default
 *   - confirmar=false:
 *       limpa todos os 4 campos (volta pro estado "sem confirmação").
 *
 * Permissão: `medicoes.aprovar` — é decisão de fiscalização (mesma
 * permissão de aprovar/rejeitar/glosar).
 *
 * Validações:
 *   - medicao_item.medicao_id deve == medicaoId (item pertence à medição)
 *   - medicao deve pertencer ao contrato (sanity)
 *   - medição NÃO pode estar aprovada (a confirmação é PRÉ-aprovação;
 *     pra mexer em aprovada, exige nova medição corretiva).
 */

const Body = z.object({
  confirmar: z.boolean(),
  motivo: z.string().trim().max(2000).optional(),
})

const ParamsSchema = z.object({
  id: uuid(),
  medicaoId: uuid(),
  itemId: uuid(),
})

const MOTIVO_DEFAULT =
  'fornecedor confirmou que não emitirá mais NF — material concluído com NFs já lançadas'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string; itemId: string }> },
) {
  try {
    // Permissão: mesma que aprovar medição (decisão de fiscalização)
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem confirmar "sem NF".' },
        { status: check.status },
      )
    }

    const rawParams = await params
    const paramsCheck = ParamsSchema.safeParse(rawParams)
    if (!paramsCheck.success) {
      return apiError('IDs inválidos.', { status: 400 })
    }
    const { id: contratoId, medicaoId, itemId } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { confirmar, motivo } = parsed.data

    const admin = createAdminClient()

    // Valida vínculo medicao_item → medicao → contrato
    const { data: itemRaw, error: itemErr } = await admin
      .from('medicao_itens')
      .select(
        'id, medicao_id, confirmacao_sem_nf, confirmacao_sem_nf_motivo, medicao:medicoes!inner(id, contrato_id, status)',
      )
      .eq('id', itemId)
      .single()
    if (itemErr || !itemRaw) {
      return apiError('Item de medição não encontrado.', { status: 404 })
    }
    const item = itemRaw as any

    // Sanity: item pertence à medição da rota
    if (item.medicao_id !== medicaoId) {
      return apiError('Item não pertence à medição informada.', { status: 400 })
    }
    // Sanity: medição pertence ao contrato da rota
    const med = item.medicao
    if (!med || med.contrato_id !== contratoId) {
      return apiError('Medição não pertence ao contrato informado.', { status: 400 })
    }
    // Bloqueio: medição já aprovada não pode mudar confirmação
    // (decisão pré-aprovação; depois de aprovado, só com medição corretiva)
    if (med.status === 'aprovado') {
      return NextResponse.json(
        {
          error: 'Medição já aprovada. Para alterar a confirmação, abra uma medição corretiva.',
          code: 'MEDICAO_APROVADA',
        },
        { status: 409 },
      )
    }

    // Recupera o user pelo cliente USER-SCOPED (criado a partir dos cookies)
    // — `confirmacao_sem_nf_por_id` precisa ser o ID do user logado, não do
    // service role.
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return apiError('Não autenticado.', { status: 401 })
    }

    const before = {
      confirmacao_sem_nf: Boolean(item.confirmacao_sem_nf),
      confirmacao_sem_nf_motivo: item.confirmacao_sem_nf_motivo ?? null,
    }

    let updatePayload: Record<string, unknown>
    if (confirmar) {
      const motivoFinal = motivo && motivo.length > 0 ? motivo : MOTIVO_DEFAULT
      updatePayload = {
        confirmacao_sem_nf: true,
        confirmacao_sem_nf_em: new Date().toISOString(),
        confirmacao_sem_nf_por_id: user.id,
        confirmacao_sem_nf_motivo: motivoFinal,
      }
    } else {
      updatePayload = {
        confirmacao_sem_nf: false,
        confirmacao_sem_nf_em: null,
        confirmacao_sem_nf_por_id: null,
        confirmacao_sem_nf_motivo: null,
      }
    }

    const { data: updated, error: upErr } = await admin
      .from('medicao_itens')
      .update(updatePayload)
      .eq('id', itemId)
      .select(
        'id, confirmacao_sem_nf, confirmacao_sem_nf_em, confirmacao_sem_nf_por_id, confirmacao_sem_nf_motivo',
      )
      .single()
    if (upErr) throw upErr

    await audit({
      event: confirmar ? 'medicao_item.confirmacao_sem_nf_aplicada' : 'medicao_item.confirmacao_sem_nf_removida',
      entity_type: 'medicao_item',
      entity_id: itemId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before,
      after: {
        confirmacao_sem_nf: (updated as any)?.confirmacao_sem_nf ?? null,
        confirmacao_sem_nf_motivo: (updated as any)?.confirmacao_sem_nf_motivo ?? null,
      },
      metadata: { medicao_id: medicaoId, contrato_id: contratoId },
      request: req,
    })

    return NextResponse.json({ ok: true, item: updated })
  } catch (e: any) {
    return apiError(e)
  }
}
