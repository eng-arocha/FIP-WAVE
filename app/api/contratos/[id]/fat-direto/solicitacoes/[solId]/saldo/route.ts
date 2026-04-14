import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/fat-direto/solicitacoes/[solId]/saldo
 *
 * Retorna o estado financeiro do pedido + das NFs já lançadas.
 * Usado pela UI de registro de NF pra:
 *   - Exibir barra de progresso (pct_utilizado)
 *   - Alertar visualmente quando > 95% (P2.9)
 *   - Impedir submit se já estiver 100%
 *
 * Resposta: {
 *   pedido_valor, total_nf_validadas, total_nf_pendentes, saldo_liquido,
 *   pct_utilizado, alerta: 'ok' | 'atencao' | 'critico' | 'esgotado',
 *   nfs_ativas: [...]
 * }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const admin = createAdminClient()

    const { data: sol, error } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, valor_total, status, fornecedor_cnpj, fornecedor_razao_social, data_aprovacao')
      .eq('id', solId)
      .single()
    if (error || !sol) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
    }

    const { data: nfs } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id, numero_nf, cnpj_emitente, valor, status, data_emissao')
      .eq('solicitacao_id', solId)

    const ativas = (nfs || []).filter(n => n.status !== 'rejeitada')
    const pedido_valor = Number(sol.valor_total || 0)
    const total_validadas = ativas.filter(n => n.status === 'validada').reduce((s, n) => s + Number(n.valor || 0), 0)
    const total_pendentes = ativas.filter(n => n.status === 'pendente').reduce((s, n) => s + Number(n.valor || 0), 0)
    const soma_ativas = total_validadas + total_pendentes
    const saldo = pedido_valor - soma_ativas
    const pct = pedido_valor > 0 ? (soma_ativas / pedido_valor) * 100 : 0

    let alerta: 'ok' | 'atencao' | 'critico' | 'esgotado' = 'ok'
    if (pct >= 100 || saldo <= 0.01) alerta = 'esgotado'
    else if (pct >= 95) alerta = 'critico'
    else if (pct >= 80) alerta = 'atencao'

    return NextResponse.json({
      pedido: {
        id: sol.id,
        valor_total: pedido_valor,
        status: sol.status,
        fornecedor_razao_social: sol.fornecedor_razao_social,
        fornecedor_cnpj: sol.fornecedor_cnpj,
        data_aprovacao: sol.data_aprovacao,
      },
      total_nf_validadas: total_validadas,
      total_nf_pendentes: total_pendentes,
      saldo_liquido: saldo,
      pct_utilizado: pct,
      alerta,
      nfs_ativas: ativas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
