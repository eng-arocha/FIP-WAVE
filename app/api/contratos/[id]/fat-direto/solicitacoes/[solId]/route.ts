import { NextResponse } from 'next/server'
import { getSolicitacao } from '@/lib/db/fat-direto'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    return NextResponse.json(await getSolicitacao(solId))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
