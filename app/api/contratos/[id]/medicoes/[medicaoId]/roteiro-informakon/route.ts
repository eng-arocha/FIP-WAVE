import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { montarRoteiroInformakon } from '@/lib/db/roteiro-informakon'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/roteiro-informakon
 *
 * O roteiro de lançamento: por macro grupo, exatamente o que se digita no
 * Informakon — o percentual de cada item, o valor do desconto de material já
 * repartido nota a nota em FIFO, e o que a FIP precisa emitir antes.
 *
 * Só apresentação: o dinheiro todo vem do boletim, sem recálculo.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('medicoes', 'visualizar')
  if (negado) return negado
  try {
    const { id: contratoId, medicaoId } = await params
    const roteiro = await montarRoteiroInformakon(createAdminClient(), contratoId, medicaoId)
    if (!roteiro) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })
    return NextResponse.json(roteiro, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
