import { NextResponse } from 'next/server'
import { getEmpresas, createEmpresa, updateEmpresa } from '@/lib/db/empresas'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const data = await getEmpresas()
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createEmpresa(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
