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
 * Suporta `?limit=N` (default 50, max 200) pra controlar quantos
 * registros vêm no histórico. Pendentes sempre vêm completos —
 * são poucos por natureza.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200)

    const [pendentes, historico] = await Promise.all([
      getMedicoesPendentes(),
      getMedicoesHistorico(),
    ])

    const admin = createAdminClient()
    const { data: fipHistorico } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, status, data_solicitacao, data_aprovacao, valor_total,
        fornecedor_razao_social, numero_pedido_fip, motivo_rejeicao,
        contrato:contratos(id, numero, descricao),
        solicitante:perfis!solicitante_id(id, nome, email),
        aprovador:perfis!aprovador_id(id, nome, email)
      `)
      .in('status', ['aprovado', 'rejeitado', 'cancelado'])
      .order('data_aprovacao', { ascending: false, nullsFirst: false })
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
