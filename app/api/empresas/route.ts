import { NextResponse } from 'next/server'
import { getEmpresas, createEmpresa, updateEmpresa } from '@/lib/db/empresas'

export async function GET() {
  try {
    const data = await getEmpresas()
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createEmpresa(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
