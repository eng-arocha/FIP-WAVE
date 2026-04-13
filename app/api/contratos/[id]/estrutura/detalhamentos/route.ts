import { NextResponse } from 'next/server'
import { createDetalhamento } from '@/lib/db/estrutura'
import { apiError } from '@/lib/api/error-response'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createDetalhamento(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
