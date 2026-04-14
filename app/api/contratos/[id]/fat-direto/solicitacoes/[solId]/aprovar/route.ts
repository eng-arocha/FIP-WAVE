import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermissao, getUsuarioLogado } from '@/lib/api/auth'
import { atualizarStatusSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'

const Body = z.object({
  acao: z.enum(['aprovado', 'rejeitado', 'cancelado', 'aguardando_aprovacao']),
  motivo_rejeicao: z.string().max(2000).optional(),
}).refine(b => b.acao !== 'rejeitado' || (b.motivo_rejeicao && b.motivo_rejeicao.trim().length >= 3), {
  message: 'Motivo de rejeição é obrigatório (mín. 3 caracteres).',
  path: ['motivo_rejeicao'],
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { acao, motivo_rejeicao } = parsed.data
    const { solId } = await params

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
