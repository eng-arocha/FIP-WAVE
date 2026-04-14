import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertAdmin } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { reseedOrcamento } from '@/lib/db/reseed-orcamento'
import { audit } from '@/lib/api/audit'

/**
 * POST /api/admin/reseed-orcamento
 *
 * Re-seedа a estrutura do contrato a partir da planilha oficial
 * (lib/db/seed/orcamento-wave.json). Preservа IDs existentes —
 * apenas corrige valores divergentes.
 *
 * Body: { contrato_id: UUID, dry_run?: boolean }
 *
 * Use `dry_run: true` primeiro pra ver o relatório sem gravar.
 * Depois rode com `dry_run: false` pra aplicar.
 */
const Body = z.object({
  contrato_id: uuid(),
  dry_run: z.boolean().default(true),
})

export async function POST(req: Request) {
  try {
    const isAdmin = await assertAdmin()
    if (!isAdmin) return NextResponse.json({ error: 'admin only' }, { status: 403 })

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { contrato_id, dry_run } = parsed.data

    const relatorio = await reseedOrcamento(contrato_id, { dryRun: dry_run })

    await audit({
      event: dry_run ? 'orcamento.reseed_simulado' : 'orcamento.reseed_aplicado',
      entity_type: 'contrato',
      entity_id: contrato_id,
      metadata: { dry_run, relatorio },
      request: req,
    })

    return NextResponse.json(relatorio)
  } catch (e: any) {
    return apiError(e)
  }
}
