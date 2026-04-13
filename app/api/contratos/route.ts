import { NextResponse } from 'next/server'
import { getContratos, createContrato } from '@/lib/db/contratos'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const data = await getContratos()
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createContrato(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
