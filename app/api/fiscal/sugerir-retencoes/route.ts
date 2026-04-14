import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { sugerirRetencoes, PERFIS_RETENCAO, totalRetido, valorLiquido } from '@/lib/fiscal/retencoes'

/**
 * POST /api/fiscal/sugerir-retencoes
 *
 * Calcula sugestão de retenções baseada em valor bruto + perfil.
 * Endpoint puro (sem persistência) — frontend usa pra auto-fill do form.
 *
 * Body: { valor_bruto: number, perfil: 'material'|'servico_mao_obra'|... }
 * Resposta: { retencoes, total_retido, valor_liquido }
 */
const Body = z.object({
  valor_bruto: z.number().positive('Valor bruto deve ser positivo.').finite(),
  perfil: z.enum(['material', 'servico_mao_obra', 'servico_tecnico', 'locacao']),
})

export async function POST(req: Request) {
  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { valor_bruto, perfil } = parsed.data

    const sugeridas = sugerirRetencoes(valor_bruto, PERFIS_RETENCAO[perfil])
    return NextResponse.json({
      retencoes: sugeridas,
      total_retido: totalRetido(sugeridas),
      valor_liquido: valorLiquido(valor_bruto, sugeridas),
    })
  } catch (e: any) {
    return apiError(e)
  }
}
