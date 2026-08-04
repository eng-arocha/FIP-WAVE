import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { calcularSaldoPedido } from '@/lib/db/saldo-pedido'

/**
 * GET /api/contratos/[id]/fat-direto/solicitacoes/[solId]/saldo
 *
 * Retorna o estado financeiro do pedido + das NFs já lançadas.
 * Usado pela UI de registro de NF pra:
 *   - Exibir barra de progresso (pct_utilizado)
 *   - Alertar visualmente quando > 95% (P2.9)
 *   - Impedir submit se já estiver 100%
 *   - Mostrar o saldo real no fluxo de encerramento de saldo
 *
 * IMPORTANTE: os status de NF são os da máquina de estados de `nf-status.ts`
 * (aguardando_aprovacao | aprovada | em_correcao | cancelada, migration 065).
 * Usa `nfReservaSaldo`/`nfPendente` — filtrar por strings soltas aqui já
 * causou saldo inflado (NFs aprovadas não eram descontadas e o pedido
 * aparecia inteiro como "saldo a devolver" no encerramento).
 *
 * Resposta: {
 *   pedido_valor, total_nf_aprovadas, total_nf_pendentes, total_nf_ativas,
 *   saldo_liquido, pct_utilizado, alerta: 'ok'|'atencao'|'critico'|'esgotado',
 *   nfs_ativas: [...]
 * }
 * (`total_nf_validadas` é mantido como alias legado de `total_nf_aprovadas`.)
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

    // "Ativa" = reserva saldo do pedido (tudo menos cancelada / rejeitada legada).
    const ativas = (nfs || []).filter(n => nfReservaSaldo(n.status))
    const s = calcularSaldoPedido(sol.valor_total, nfs)

    return NextResponse.json({
      pedido: {
        id: sol.id,
        valor_total: s.pedido_valor,
        status: sol.status,
        fornecedor_razao_social: sol.fornecedor_razao_social,
        fornecedor_cnpj: sol.fornecedor_cnpj,
        data_aprovacao: sol.data_aprovacao,
      },
      total_nf_aprovadas: s.total_nf_aprovadas,
      /** @deprecated alias legado de total_nf_aprovadas */
      total_nf_validadas: s.total_nf_aprovadas,
      total_nf_pendentes: s.total_nf_pendentes,
      total_nf_ativas: s.total_nf_ativas,
      saldo_liquido: s.saldo_liquido,
      pct_utilizado: s.pct_utilizado,
      alerta: s.alerta,
      nfs_ativas: ativas,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
