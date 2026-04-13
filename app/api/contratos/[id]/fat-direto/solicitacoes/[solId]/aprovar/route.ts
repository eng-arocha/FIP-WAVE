import { NextResponse } from 'next/server'
import { assertPermissao, getUsuarioLogado } from '@/lib/api/auth'
import { atualizarStatusSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const { acao, motivo_rejeicao } = await req.json()

    if (!['aprovado', 'rejeitado', 'cancelado', 'aguardando_aprovacao'].includes(acao)) {
      return NextResponse.json({ error: 'acao inválida' }, { status: 400 })
    }

    // Aprovar/rejeitar exige a permissão `aprovacoes.aprovar`.
    // Cancelar e reenviar para análise são ações do solicitante — basta autenticação.
    if (acao === 'aprovado' || acao === 'rejeitado') {
      const check = await assertPermissao('aprovacoes', 'aprovar')
      if (!check.ok) {
        return NextResponse.json(
          { error: 'Apenas usuários com permissão de aprovação podem aprovar ou rejeitar solicitações.' },
          { status: check.status }
        )
      }
      await atualizarStatusSolicitacao(solId, acao, check.userId, motivo_rejeicao)
      return NextResponse.json({ ok: true })
    }

    // Demais ações: precisa estar autenticado
    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    await atualizarStatusSolicitacao(solId, acao, user.id, motivo_rejeicao)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
