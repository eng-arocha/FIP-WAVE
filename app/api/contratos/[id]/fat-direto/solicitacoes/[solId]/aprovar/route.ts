import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { atualizarStatusSolicitacao } from '@/lib/db/fat-direto'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { acao, motivo_rejeicao } = await req.json()
    if (!['aprovado', 'rejeitado', 'cancelado', 'aguardando_aprovacao'].includes(acao)) {
      return NextResponse.json({ error: 'acao inválida' }, { status: 400 })
    }

    await atualizarStatusSolicitacao(solId, acao, user.id, motivo_rejeicao)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
