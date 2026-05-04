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
 * PATCH /api/contratos/[id]/medicoes/[medicaoId]/itens/[itemId]/ajustar
 *
 * Admin (aprovador) ajusta a quantidade medida de um item da medição
 * durante o fluxo de aprovação. Cria linha de auditoria em
 * `medicao_item_ajustes` + atualiza `medicao_itens.quantidade_medida`
 * na mesma operação.
 *
 * Body: { quantidade_nova: number, motivo: string (>=10 chars) }
 *
 * Permissão: `medicoes.aprovar` (mesma que aprovar/rejeitar/sem-nf).
 *
 * Validações:
 *   - item pertence à medição da rota; medição pertence ao contrato
 *   - status da medição em ['submetido', 'em_analise', 'rascunho']
 *     (não permite editar aprovado/rejeitado — pra aprovado, exige
 *     desfazer-aprovacao primeiro)
 *   - quantidade_nova >= 0 e diferente da atual
 *   - motivo >= 10 chars
 */

const Body = z.object({
  quantidade_nova: z.number().min(0, 'Quantidade não pode ser negativa.'),
  motivo: z.string().trim().min(10, 'Motivo precisa ter pelo menos 10 caracteres.').max(2000),
})

const ParamsSchema = z.object({
  id: uuid(),
  medicaoId: uuid(),
  itemId: uuid(),
})

const STATUS_PERMITIDOS = new Set(['submetido', 'em_analise', 'rascunho'])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string; itemId: string }> },
) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem ajustar quantidade.' },
        { status: check.status },
      )
    }

    const rawParams = await params
    const paramsCheck = ParamsSchema.safeParse(rawParams)
    if (!paramsCheck.success) return apiError('IDs inválidos.', { status: 400 })
    const { id: contratoId, medicaoId, itemId } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { quantidade_nova, motivo } = parsed.data

    const admin = createAdminClient()

    // Vínculo medicao_item → medicao → contrato + status
    const { data: itemRaw, error: itemErr } = await admin
      .from('medicao_itens')
      .select(
        'id, medicao_id, quantidade_medida, detalhamento_id, medicao:medicoes!inner(id, contrato_id, status)',
      )
      .eq('id', itemId)
      .single()
    if (itemErr || !itemRaw) {
      return apiError('Item de medição não encontrado.', { status: 404 })
    }
    const item = itemRaw as any

    if (item.medicao_id !== medicaoId) {
      return apiError('Item não pertence à medição informada.', { status: 400 })
    }
    const med = item.medicao
    if (!med || med.contrato_id !== contratoId) {
      return apiError('Medição não pertence ao contrato informado.', { status: 400 })
    }

    if (!STATUS_PERMITIDOS.has(med.status)) {
      return NextResponse.json(
        {
          error: med.status === 'aprovado'
            ? 'Medição já aprovada. Para ajustar, primeiro desfaça a aprovação.'
            : `Não é possível ajustar quantidade em medição com status "${med.status}".`,
          code: 'STATUS_INVALIDO',
        },
        { status: 409 },
      )
    }

    const quantidadeAnterior = Number(item.quantidade_medida ?? 0)
    if (Math.abs(quantidadeAnterior - quantidade_nova) < 1e-6) {
      return apiError('Quantidade nova é igual à atual — nada a ajustar.', { status: 400 })
    }

    // Recupera user pelo client user-scoped (cookies) pra registrar
    // ajustado_por_id corretamente (não o service-role).
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('Não autenticado.', { status: 401 })

    // 1) Insere linha de auditoria
    const { error: insErr } = await admin
      .from('medicao_item_ajustes')
      .insert({
        medicao_item_id: itemId,
        quantidade_anterior: quantidadeAnterior,
        quantidade_nova,
        motivo: motivo.trim(),
        ajustado_por_id: user.id,
      })
    if (insErr) {
      // Se a tabela não existe ainda (migration 061 pendente), retorna 503.
      const msg = insErr.message || ''
      if (msg.includes('medicao_item_ajustes') && msg.toLowerCase().includes('does not exist')) {
        return NextResponse.json(
          { error: 'Funcionalidade pendente: rode a migration 061 no Supabase.', code: 'MIGRATION_PENDENTE' },
          { status: 503 },
        )
      }
      throw insErr
    }

    // 2) Atualiza quantidade_medida do item
    const { error: upErr } = await admin
      .from('medicao_itens')
      .update({ quantidade_medida: quantidade_nova })
      .eq('id', itemId)
    if (upErr) throw upErr

    await audit({
      event: 'medicao_item.quantidade_ajustada_pelo_admin',
      entity_type: 'medicao_item',
      entity_id: itemId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before: { quantidade_medida: quantidadeAnterior },
      after: { quantidade_medida: quantidade_nova },
      metadata: { medicao_id: medicaoId, contrato_id: contratoId, motivo: motivo.trim() },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      ajuste: {
        quantidade_anterior: quantidadeAnterior,
        quantidade_nova,
        motivo: motivo.trim(),
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
