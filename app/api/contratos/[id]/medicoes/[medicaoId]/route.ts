import { NextResponse } from 'next/server'
import { getMedicao } from '@/lib/db/medicoes'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const { medicaoId } = await params
    const data = await getMedicao(medicaoId)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
