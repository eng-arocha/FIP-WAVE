import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  desfazerAprovacaoMedicao,
  DesfazerAprovacaoError,
} from '@/lib/db/medicao-revisao'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/contratos/[id]/medicoes/[medicaoId]/desfazer-aprovacao
 *
 * Reverte o status de uma medição APROVADA pra 'submetido'. Bloqueado se
 * houve NF FIP material lançada após a aprovação (a NF pertence à medição
 * aprovada — reverter sem cancelar a NF deixaria histórico inconsistente).
 *
 * Body: { motivo: string }
 * Permissão: medicoes.aprovar
 */

const Body = z.object({
  motivo: z.string().trim().min(3, 'Motivo é obrigatório (mín. 3 caracteres).').max(2000),
})

const ParamsSchema = z.object({
  id: uuid(),
  medicaoId: uuid(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem desfazer aprovação de medições.' },
        { status: check.status },
      )
    }

    const rawParams = await params
    const paramsCheck = ParamsSchema.safeParse(rawParams)
    if (!paramsCheck.success) {
      return apiError('IDs inválidos.', { status: 400 })
    }
    const { id: contratoId, medicaoId } = paramsCheck.data

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { motivo } = parsed.data

    // Sanity: medicao pertence ao contrato da rota (defesa contra
    // tentativas de manipular IDs entre contratos)
    const admin = createAdminClient()
    const { data: medCheck } = await admin
      .from('medicoes')
      .select('id, contrato_id')
      .eq('id', medicaoId)
      .single()
    if (!medCheck) {
      return apiError('Medição não encontrada.', { status: 404 })
    }
    if ((medCheck as any).contrato_id !== contratoId) {
      return apiError('Medição não pertence a este contrato.', { status: 400 })
    }

    await desfazerAprovacaoMedicao({
      medicao_id: medicaoId,
      motivo,
      revisado_por_id: check.userId,
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    if (e instanceof DesfazerAprovacaoError) {
      // 409: bloqueio funcional (NFs posteriores impedem o desfazer)
      // 422: status inválido (já é 'submetido' etc.)
      // 404: não encontrada
      const status =
        e.code === 'NFS_POSTERIORES' ? 409 :
        e.code === 'STATUS_INVALIDO' ? 422 :
        404
      return NextResponse.json(
        { error: e.message, code: e.code, detail: e.detail },
        { status },
      )
    }
    return apiError(e)
  }
}
