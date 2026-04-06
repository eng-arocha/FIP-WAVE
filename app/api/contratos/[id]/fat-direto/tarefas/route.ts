import { NextResponse } from 'next/server'
import { listarTarefasParaSolicitacao } from '@/lib/db/fat-direto'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await listarTarefasParaSolicitacao(id)
    return NextResponse.json(data)
  } catch (e: any) {
    console.error('[fat-direto/tarefas] Erro ao carregar detalhamentos:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
