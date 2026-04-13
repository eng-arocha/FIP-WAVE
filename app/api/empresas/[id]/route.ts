import { NextResponse } from 'next/server'
import { updateEmpresa } from '@/lib/db/empresas'
import { apiError } from '@/lib/api/error-response'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = await updateEmpresa(id, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
