import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularBoletimSimulado } from '@/lib/db/informacon-data'
import { parseBody } from '@/lib/api/schema'
import { apiError } from '@/lib/api/error-response'

/**
 * POST /api/contratos/[id]/medicoes/simular
 *
 * Dry-run do boletim INFORMAKON a partir dos itens digitados no form de
 * Nova Medição — SEM gravar nada. Retorna, por item e no total: material
 * medido, material já com NF lançada, saldo de pedidos aprovados, direito
 * de NF material FIP e serviço líquido (NF de serviço a emitir).
 *
 * Body: { itens: [{ detalhamento_id, quantidade_medida }] }
 */
const Body = z.object({
  itens: z.array(z.object({
    detalhamento_id: z.string().uuid(),
    quantidade_medida: z.number().nonnegative(),
  })).default([]),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: contratoId } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const admin = createAdminClient()
    const boletim = await calcularBoletimSimulado(admin, contratoId, parsed.data.itens ?? [])
    return NextResponse.json(boletim)
  } catch (e: any) {
    return apiError(e)
  }
}
