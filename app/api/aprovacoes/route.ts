import { NextResponse } from 'next/server'
import { getMedicoesPendentes, getMedicoesHistorico } from '@/lib/db/medicoes'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/aprovacoes
 *
 * Retorna:
 *   - pendentes:    medições aguardando análise (submetido | em_analise)
 *   - historico:    medições já decididas (aprovado | rejeitado | cancelado)
 *   - historicoFip: solicitações de faturamento direto já decididas
 *                   (aprovado | rejeitado | cancelado). Usado na aba
 *                   Histórico junto com o histórico de medições.
 */
export async function GET() {
  try {
    const [pendentes, historico] = await Promise.all([
      getMedicoesPendentes(),
      getMedicoesHistorico(),
    ])

    // Solicitações de faturamento direto já decididas
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
      .limit(50)

    return NextResponse.json({
      pendentes,
      historico,
      historicoFip: fipHistorico ?? [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
