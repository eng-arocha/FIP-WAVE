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
 * PATCH /api/contratos/[id]/medicoes/[medicaoId]/detalhamentos/[detalhamentoId]/ajustar
 *
 * Admin (aprovador) ajusta a quantidade medida de um detalhamento numa
 * medição. Faz upsert: se já existe `medicao_item` para (medicao_id,
 * detalhamento_id), atualiza; senão, cria com a nova quantidade.
 *
 * Esta rota substitui a antiga `[itemId]/ajustar` pra cobrir o caso onde
 * o item nunca foi medido (ex.: item 19 Administração) e portanto não
 * existe ainda em `medicao_itens`.
 *
 * Body: { quantidade_nova: number, motivo: string (>=10 chars) }
 *
 * Permissão: `medicoes.aprovar`.
 */

const Body = z.object({
  quantidade_nova: z.number().min(0, 'Quantidade não pode ser negativa.'),
  motivo: z.string().trim().min(10, 'Motivo precisa ter pelo menos 10 caracteres.').max(2000),
})

const ParamsSchema = z.object({
  id: uuid(),
  medicaoId: uuid(),
  detalhamentoId: uuid(),
})

const STATUS_PERMITIDOS = new Set(['submetido', 'em_analise', 'rascunho'])

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string; detalhamentoId: string }> },
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
    const { id: contratoId, medicaoId, detalhamentoId } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { quantidade_nova, motivo } = parsed.data

    const admin = createAdminClient()

    // Valida medição pertence ao contrato + status permitido
    const { data: medicao, error: medErr } = await admin
      .from('medicoes')
      .select('id, contrato_id, status')
      .eq('id', medicaoId)
      .single()
    if (medErr || !medicao) return apiError('Medição não encontrada.', { status: 404 })
    if (medicao.contrato_id !== contratoId) {
      return apiError('Medição não pertence ao contrato informado.', { status: 400 })
    }
    if (!STATUS_PERMITIDOS.has(medicao.status)) {
      return NextResponse.json(
        {
          error: medicao.status === 'aprovado'
            ? 'Medição já aprovada. Para ajustar, primeiro desfaça a aprovação.'
            : `Não é possível ajustar quantidade em medição com status "${medicao.status}".`,
          code: 'STATUS_INVALIDO',
        },
        { status: 409 },
      )
    }

    // Valida detalhamento existe + pertence ao contrato (via tarefa)
    const { data: det, error: detErr } = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, valor_unitario, tarefa:tarefas!inner(contrato_id)')
      .eq('id', detalhamentoId)
      .single()
    if (detErr || !det) return apiError('Detalhamento não encontrado.', { status: 404 })
    if ((det as any).tarefa?.contrato_id !== contratoId) {
      return apiError('Detalhamento não pertence ao contrato informado.', { status: 400 })
    }

    // User session pra ajustado_por_id
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError('Não autenticado.', { status: 401 })

    // Localiza medicao_item existente (1 row por medicao+detalhamento)
    const { data: existingItem } = await admin
      .from('medicao_itens')
      .select('id, quantidade_medida')
      .eq('medicao_id', medicaoId)
      .eq('detalhamento_id', detalhamentoId)
      .maybeSingle()

    const quantidadeAnterior = Number(existingItem?.quantidade_medida ?? 0)

    if (Math.abs(quantidadeAnterior - quantidade_nova) < 1e-6) {
      return apiError('Quantidade nova é igual à atual — nada a ajustar.', { status: 400 })
    }

    let medicaoItemId: string

    if (existingItem) {
      // UPDATE
      const { error: upErr } = await admin
        .from('medicao_itens')
        .update({ quantidade_medida: quantidade_nova })
        .eq('id', existingItem.id)
      if (upErr) throw upErr
      medicaoItemId = existingItem.id
    } else {
      // INSERT — primeira vez que esse detalhamento é medido nesta medição
      const valorUnit = Number((det as any).valor_unitario ?? 0)
      const { data: novoItem, error: insErr } = await admin
        .from('medicao_itens')
        .insert({
          medicao_id: medicaoId,
          detalhamento_id: detalhamentoId,
          quantidade_medida: quantidade_nova,
          valor_unitario: valorUnit,
        })
        .select('id')
        .single()
      if (insErr) throw insErr
      medicaoItemId = (novoItem as any).id
    }

    // Linha de auditoria em medicao_item_ajustes (migration 061)
    const { error: ajusteErr } = await admin
      .from('medicao_item_ajustes')
      .insert({
        medicao_item_id: medicaoItemId,
        quantidade_anterior: quantidadeAnterior,
        quantidade_nova,
        motivo: motivo.trim(),
        ajustado_por_id: user.id,
      })
    if (ajusteErr) {
      const msg = ajusteErr.message || ''
      if (msg.includes('medicao_item_ajustes') && msg.toLowerCase().includes('does not exist')) {
        return NextResponse.json(
          { error: 'Funcionalidade pendente: rode a migration 061 no Supabase.', code: 'MIGRATION_PENDENTE' },
          { status: 503 },
        )
      }
      // Não-fatal: a quantidade foi atualizada mas a auditoria não. Loga e segue.
      console.warn('[ajustar] falha ao gravar auditoria:', ajusteErr.message)
    }

    await audit({
      event: existingItem
        ? 'medicao_item.quantidade_ajustada_pelo_admin'
        : 'medicao_item.criado_pelo_admin_via_ajuste',
      entity_type: 'medicao_item',
      entity_id: medicaoItemId,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before: { quantidade_medida: quantidadeAnterior },
      after: { quantidade_medida: quantidade_nova },
      metadata: { medicao_id: medicaoId, contrato_id: contratoId, detalhamento_id: detalhamentoId, motivo: motivo.trim() },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      medicao_item_id: medicaoItemId,
      criado: !existingItem,
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
