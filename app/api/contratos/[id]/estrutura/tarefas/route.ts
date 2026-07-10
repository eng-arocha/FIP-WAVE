import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { createTarefa } from '@/lib/db/estrutura'
import { apiError } from '@/lib/api/error-response'

export async function POST(req: Request) {
  const negado = await requirePermissao('contratos', 'editar')
  if (negado) return negado
  try {
    const body = await req.json()
    // Accept both grupo_id (from page) and grupo_macro_id
    const input = { ...body, grupo_macro_id: body.grupo_macro_id || body.grupo_id }
    const data = await createTarefa(input)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
