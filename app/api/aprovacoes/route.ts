import { NextResponse } from 'next/server'
import { getMedicoesPendentes, getMedicoesHistorico } from '@/lib/db/medicoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/aprovacoes
 *
 * Retorna:
 *   - pendentes:    medições aguardando análise (submetido | em_analise)
 *   - historico:    medições já decididas (aprovado | rejeitado | cancelado)
 *   - historicoFip: solicitações de faturamento direto já decididas
 *
 * Suporta `?limit=N` (default 1000, max 1000) pra controlar quantos
 * registros vêm no histórico. Default alto: o histórico precisa listar
 * TODAS as solicitações decididas — limit baixo escondia registros
 * (ex.: 82 solicitações no nf-fat-direto vs 50 aqui).
 * Pendentes sempre vêm completos — são poucos por natureza.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 1000, 1), 1000)

    const [pendentes, historico] = await Promise.all([
      getMedicoesPendentes(),
      getMedicoesHistorico(),
    ])

    const admin = createAdminClient()
    // ORDER BY updated_at (sempre preenchido na transicao de status).
    // ANTES era ORDER BY data_aprovacao, mas rejeitados ficam com
    // data_aprovacao NULL e eram empurrados pro fim do resultset —
    // com limit=50 eles caiam fora da pagina.
    const { data: fipHistorico } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, status, data_solicitacao, data_aprovacao, updated_at, valor_total,
        fornecedor_razao_social, numero_pedido_fip, motivo_rejeicao, observacoes,
        contrato:contratos(id, numero, descricao),
        solicitante:perfis!solicitante_id(id, nome, email),
        aprovador:perfis!aprovador_id(id, nome, email)
      `)
      .in('status', ['aprovado', 'rejeitado', 'cancelado'])
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(limit)

    return NextResponse.json({
      pendentes,
      historico,
      historicoFip: fipHistorico ?? [],
    })
  } catch (e: any) {
    return apiError(e)
  }
}
