import { NextResponse } from 'next/server'
import { getGruposMacro } from '@/lib/db/estrutura'
import { apiError } from '@/lib/api/error-response'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await getGruposMacro(id)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
