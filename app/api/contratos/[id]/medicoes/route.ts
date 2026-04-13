import { NextResponse } from 'next/server'
import { getMedicoes, createMedicao } from '@/lib/db/medicoes'
import { apiError } from '@/lib/api/error-response'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await getMedicoes(id)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = await createMedicao({ ...body, contrato_id: id })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
