import { NextResponse } from 'next/server'
import { listarTarefasParaSolicitacao } from '@/lib/db/fat-direto'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await listarTarefasParaSolicitacao(id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
