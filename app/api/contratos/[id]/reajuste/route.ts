import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid, dataIso } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * POST /api/contratos/[id]/reajuste
 *
 * Aplica um reajuste contratual:
 *  - Multiplica o coeficiente_reajuste_atual pelo (1 + variacao_pct/100)
 *  - Grava registro em contratos_reajustes
 *  - Audita
 *
 * O coeficiente é o que multiplica os valores unitários nas próximas
 * medições (lib/db/medicoes.ts deve consultá-lo ao calcular valor_medido
 * de novas medições — ajuste posterior, fora desse PR).
 *
 * Body: { data_aplicacao: 'YYYY-MM-DD', indice: 'INCC'|'IPCA'|..., variacao_pct: number, observacao?: string }
 *
 * Permissão: aprovacoes.aprovar (decisão financeira).
 */
const Body = z.object({
  data_aplicacao: dataIso(),
  indice: z.enum(['INCC', 'IPCA', 'IGPM', 'IGP-DI', 'manual']),
  variacao_pct: z.number().finite()
    .refine(v => v > -50 && v < 100, 'Variação % fora do razoável (-50 a 100).'),
  observacao: z.string().max(1000).optional(),
})

const ParamsSchema = z.object({ id: uuid() })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Permissão necessária pra aplicar reajuste contratual.' },
        { status: check.status },
      )
    }

    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { data_aplicacao, indice, variacao_pct, observacao } = parsed.data

    const admin = createAdminClient()
    const { data: contratoRaw, error: getErr } = await admin
      .from('contratos')
      .select('id, numero, coeficiente_reajuste_atual')
      .eq('id', id)
      .single()
    if (getErr || !contratoRaw) {
      return NextResponse.json({ error: 'Contrato não encontrado.' }, { status: 404 })
    }
    const contrato = contratoRaw as any
    const coefAnterior = Number(contrato.coeficiente_reajuste_atual ?? 1)
    const coefNovo = Number((coefAnterior * (1 + variacao_pct / 100)).toFixed(6))

    // Persiste novo coeficiente no contrato
    const { error: upErr } = await admin
      .from('contratos')
      .update({ coeficiente_reajuste_atual: coefNovo })
      .eq('id', id)
    if (upErr) throw upErr

    // Registra histórico
    const { data: reaj, error: histErr } = await admin
      .from('contratos_reajustes')
      .insert({
        contrato_id: id,
        data_aplicacao,
        indice,
        variacao_pct,
        coef_anterior: coefAnterior,
        coef_novo: coefNovo,
        observacao: observacao ?? null,
        registrado_por: check.userId,
      })
      .select()
      .single()
    if (histErr) throw histErr

    await audit({
      event: 'contrato.reajuste_aplicado',
      entity_type: 'contrato',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before: { coeficiente: coefAnterior },
      after: { coeficiente: coefNovo },
      metadata: { indice, variacao_pct, data_aplicacao, reajuste_id: reaj?.id },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      coef_anterior: coefAnterior,
      coef_novo: coefNovo,
      variacao_pct,
      reajuste_id: reaj?.id,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
