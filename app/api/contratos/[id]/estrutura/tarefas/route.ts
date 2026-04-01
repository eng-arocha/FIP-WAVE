import { NextResponse } from 'next/server'
import { createTarefa } from '@/lib/db/estrutura'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // Accept both grupo_id (from page) and grupo_macro_id
    const input = { ...body, grupo_macro_id: body.grupo_macro_id || body.grupo_id }
    const data = await createTarefa(input)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
