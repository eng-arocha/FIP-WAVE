import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { createDetalhamento } from '@/lib/db/estrutura'
import { apiError } from '@/lib/api/error-response'

export async function POST(req: Request) {
  const negado = await requirePermissao('contratos', 'editar')
  if (negado) return negado
  try {
    const body = await req.json()
    const data = await createDetalhamento(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
