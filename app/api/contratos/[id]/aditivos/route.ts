import { NextResponse } from 'next/server'
import { getAditivos, createAditivo } from '@/lib/db/contratos'
import { apiError } from '@/lib/api/error-response'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await getAditivos(id)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = await createAditivo({ ...body, contrato_id: id })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
