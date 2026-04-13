import { NextResponse } from 'next/server'
import { getContrato, getContratoResumo } from '@/lib/db/contratos'
import { apiError } from '@/lib/api/error-response'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const [contrato, resumo] = await Promise.all([
      getContrato(id),
      getContratoResumo(id).catch(() => null),
    ])
    return NextResponse.json({ ...contrato, ...resumo })
  } catch (e: any) {
    return apiError(e)
  }
}
