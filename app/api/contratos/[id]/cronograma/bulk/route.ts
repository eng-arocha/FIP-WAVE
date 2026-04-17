import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { assertPermissao } from '@/lib/api/auth'
import { z } from 'zod'

/**
 * PATCH /api/contratos/[id]/cronograma/bulk
 *
 * Upsert em massa de %s do cronograma físico/fat-direto. Usado por:
 *  - Edição inline estilo Excel (paste multi-célula, blur individual)
 *  - Importador .xlsx (futuro) — mesma API
 *
 * Body:
 *   {
 *     tipo: 'fisico' | 'fatdireto',
 *     updates: [{ grupo_macro_id: UUID, mes: 'YYYY-MM-01', pct_planejado: number }]
 *   }
 *
 * Segurança: exige admin OU permissão explícita ('cronograma', 'editar').
 * Valida que cada grupo pertence ao contrato.
 */

const BodySchema = z.object({
  tipo: z.enum(['fisico', 'fatdireto']),
  updates: z.array(z.object({
    grupo_macro_id: z.string().uuid(),
    mes: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    pct_planejado: z.number().min(0).max(1000), // permite > 100 temporariamente (validação soft na UI)
  })).min(1).max(5000),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params

    // Autorização: admin ou permissão 'cronograma.editar'
    const auth = await assertPermissao('cronograma', 'editar')
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: grupos } = await admin
      .from('grupos_macro')
      .select('id')
      .eq('contrato_id', contratoId)
    const grupoIds = new Set((grupos || []).map((g: any) => g.id))

    const valid = parsed.data.updates.filter(u => grupoIds.has(u.grupo_macro_id))
    if (valid.length === 0) {
      return NextResponse.json({ error: 'nenhum grupo válido no contrato' }, { status: 400 })
    }

    const table = parsed.data.tipo === 'fisico' ? 'planejamento_fisico' : 'planejamento_fat_direto'

    // Upsert — unique (grupo_macro_id, mes) → on conflict atualiza pct_planejado
    const rows = valid.map(u => ({
      grupo_macro_id: u.grupo_macro_id,
      mes: u.mes,
      pct_planejado: u.pct_planejado,
    }))

    const { error } = await admin
      .from(table)
      .upsert(rows, { onConflict: 'grupo_macro_id,mes' })
    if (error) throw error

    return NextResponse.json({
      atualizados: rows.length,
      rejeitados: parsed.data.updates.length - rows.length,
      tipo: parsed.data.tipo,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
