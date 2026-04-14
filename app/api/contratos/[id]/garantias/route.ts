import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid, dataIso, valorMonetario } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * GET — lista garantias do contrato (ordenado por vencimento).
 * POST — cria nova garantia (admin/aprovador).
 *
 * Campos opcionais variam por tipo:
 *   - retencao_medicao: precisa `percentual`
 *   - seguro_garantia / fianca_bancaria: precisa `numero_documento` + `emissor` + `data_vencimento`
 *   - caucao_dinheiro: só `valor` é obrigatório
 */
const Body = z.object({
  tipo: z.enum(['caucao_dinheiro', 'seguro_garantia', 'fianca_bancaria', 'retencao_medicao']),
  valor: valorMonetario(),
  percentual: z.number().min(0).max(100).optional(),
  numero_documento: z.string().max(100).optional(),
  emissor: z.string().max(200).optional(),
  data_emissao: dataIso().optional(),
  data_vencimento: dataIso().optional(),
  url_documento: z.string().url().optional(),
  observacoes: z.string().max(2000).optional(),
}).superRefine((data, ctx) => {
  if (data.tipo === 'retencao_medicao' && (data.percentual == null || data.percentual <= 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percentual'], message: 'Retenção exige percentual > 0.' })
  }
  if ((data.tipo === 'seguro_garantia' || data.tipo === 'fianca_bancaria') && !data.data_vencimento) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data_vencimento'], message: 'Seguro/fiança exige data de vencimento.' })
  }
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
      .from('garantias_contratuais')
      .select('*')
      .eq('contrato_id', id)
      .order('data_vencimento', { ascending: true, nullsFirst: false })
    if (error) throw error

    // Resumo: total ativo, próximos vencimentos
    const list = (data || []) as any[]
    const ativas = list.filter(g => g.ativa && !g.data_liberacao)
    const totalAtivo = ativas.reduce((s, g) => s + Number(g.valor || 0), 0)
    const hoje = new Date()
    const vencendo30 = ativas.filter(g => {
      if (!g.data_vencimento) return false
      const dias = (new Date(g.data_vencimento).getTime() - hoje.getTime()) / 86400_000
      return dias >= 0 && dias <= 30
    })

    return NextResponse.json({
      garantias: list,
      resumo: {
        total_ativo: totalAtivo,
        quantidade_ativa: ativas.length,
        vencendo_em_30d: vencendo30.length,
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Permissão necessária pra cadastrar garantia.' },
        { status: check.status },
      )
    }

    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const body = parsed.data

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('garantias_contratuais')
      .insert({ ...body, contrato_id: id, criado_por: check.userId })
      .select()
      .single()
    if (error) throw error

    await audit({
      event: 'garantia.criada',
      entity_type: 'garantia_contratual',
      entity_id: data.id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      metadata: { contrato_id: id, tipo: body.tipo, valor: body.valor },
      request: req,
    })

    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}
