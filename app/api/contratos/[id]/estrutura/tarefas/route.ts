import { NextResponse } from 'next/server'
import { createTarefa } from '@/lib/db/estrutura'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createTarefa(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
