import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, valorMonetario, uuid } from '@/lib/api/schema'
import { audit } from '@/lib/api/audit'

/**
 * PUT /api/notas-fiscais-fat-direto/[id]/retencoes
 *
 * Atualiza os valores retidos (ISS/INSS/IRRF/CSRF/PIS/COFINS/Outros).
 * Quem pode: usuário com permissão `notas-fiscais.editar` (ou aprovacoes.aprovar
 * como fallback durante transição).
 *
 * Validação:
 *  - Cada retenção >= 0
 *  - Soma das retenções não pode ultrapassar o valor bruto da NF
 */
const Body = z.object({
  retencao_iss:    valorMonetario({ min: 0 }).optional(),
  retencao_inss:   valorMonetario({ min: 0 }).optional(),
  retencao_irrf:   valorMonetario({ min: 0 }).optional(),
  retencao_csrf:   valorMonetario({ min: 0 }).optional(),
  retencao_pis:    valorMonetario({ min: 0 }).optional(),
  retencao_cofins: valorMonetario({ min: 0 }).optional(),
  retencao_outros: valorMonetario({ min: 0 }).optional(),
})

const ParamsSchema = z.object({ id: uuid() })

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const check = await assertPermissao('aprovacoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Permissão necessária pra editar retenções.' },
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

    // Lê valor da NF pra validar que retenções não excedem o bruto
    const { data: nfRaw, error: getErr } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id, valor, retencao_iss, retencao_inss, retencao_irrf, retencao_csrf, retencao_pis, retencao_cofins, retencao_outros')
      .eq('id', id)
      .single()
    if (getErr || !nfRaw) {
      return NextResponse.json({ error: 'NF não encontrada.' }, { status: 404 })
    }
    const nf = nfRaw as any
    const valorBruto = Number(nf.valor || 0)

    // Calcula novo total — campos não enviados mantêm valor atual
    const novo = {
      retencao_iss:    body.retencao_iss    ?? Number(nf.retencao_iss    ?? 0),
      retencao_inss:   body.retencao_inss   ?? Number(nf.retencao_inss   ?? 0),
      retencao_irrf:   body.retencao_irrf   ?? Number(nf.retencao_irrf   ?? 0),
      retencao_csrf:   body.retencao_csrf   ?? Number(nf.retencao_csrf   ?? 0),
      retencao_pis:    body.retencao_pis    ?? Number(nf.retencao_pis    ?? 0),
      retencao_cofins: body.retencao_cofins ?? Number(nf.retencao_cofins ?? 0),
      retencao_outros: body.retencao_outros ?? Number(nf.retencao_outros ?? 0),
    }

    const totalRet = Object.values(novo).reduce((a, b) => a + b, 0)
    if (totalRet > valorBruto + 0.01) {
      return NextResponse.json(
        {
          error: `Soma das retenções (R$ ${totalRet.toFixed(2)}) excede o valor bruto da NF (R$ ${valorBruto.toFixed(2)}).`,
          code: 'RETENCAO_EXCEDE_BRUTO',
        },
        { status: 400 },
      )
    }

    const before = {
      retencao_iss:    nf.retencao_iss    ?? 0,
      retencao_inss:   nf.retencao_inss   ?? 0,
      retencao_irrf:   nf.retencao_irrf   ?? 0,
      retencao_csrf:   nf.retencao_csrf   ?? 0,
      retencao_pis:    nf.retencao_pis    ?? 0,
      retencao_cofins: nf.retencao_cofins ?? 0,
      retencao_outros: nf.retencao_outros ?? 0,
    }

    const { error: upErr } = await admin
      .from('notas_fiscais_fat_direto')
      .update(novo)
      .eq('id', id)
    if (upErr) throw upErr

    await audit({
      event: 'nf_fat_direto.retencoes_atualizadas',
      entity_type: 'nota_fiscal_fat_direto',
      entity_id: id,
      actor_id: check.userId,
      actor_email: check.userEmail ?? null,
      before,
      after: novo,
      metadata: { total_retido: totalRet, valor_liquido: valorBruto - totalRet },
      request: req,
    })

    return NextResponse.json({
      ok: true,
      retencoes: novo,
      total_retido: totalRet,
      valor_liquido: valorBruto - totalRet,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
