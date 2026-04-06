import { NextResponse } from 'next/server'
import { getCurvaS } from '@/lib/db/planejamento'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await getCurvaS(id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
