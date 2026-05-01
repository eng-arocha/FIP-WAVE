import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/informacon/debug
 *
 * Diagnóstico das colunas NF TERCEIRO / SALDO APROV. / NF DESC. que
 * aparecem zeradas no boletim Informakon. Mostra os dados crus que a
 * rota /informacon usa pra calcular essas colunas:
 *   - Solicitações fat-direto aprovadas do contrato + itens + NFs
 *   - Detalhamento_ids únicos da medição (comparar com os dos itens
 *     da solicitação — se não baterem, nfAlocadaPorDet fica vazio)
 *   - Resumo de problemas conhecidos (item sem detalhamento_id, NF
 *     vinculada a solicitação não-aprovada, etc.)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const sb = createAdminClient()

    // 1) Detalhamento_ids da medição
    const { data: medItens, error: medErr } = await sb
      .from('medicao_itens')
      .select('id, detalhamento_id, quantidade_medida, detalhamento:detalhamentos(id, codigo, descricao)')
      .eq('medicao_id', medicaoId)
    if (medErr) throw medErr

    const detIdsMedicao = new Set<string>()
    const detalhamentosMedicao = (medItens || []).map((it: any) => {
      if (it.detalhamento_id) detIdsMedicao.add(it.detalhamento_id)
      return {
        medicao_item_id: it.id,
        detalhamento_id: it.detalhamento_id,
        codigo: it.detalhamento?.codigo ?? null,
        descricao: it.detalhamento?.descricao ?? null,
        quantidade_medida: Number(it.quantidade_medida ?? 0),
      }
    })

    // 2) Solicitações aprovadas do contrato (não deletadas) + itens + NFs
    const { data: solRaw, error: solErr } = await sb
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero_pedido_fip, status, deletado_em, valor_total,
        itens:itens_solicitacao_fat_direto (
          id, detalhamento_id, valor_total, qtde_solicitada, valor_unitario,
          detalhamento:detalhamentos(codigo, descricao)
        ),
        nfs:notas_fiscais_fat_direto!solicitacao_id (id, valor, status)
      `)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null)
    if (solErr) throw solErr

    type ProblemFlag =
      | 'item_sem_detalhamento_id'
      | 'detalhamento_id_nao_existe_na_medicao'
      | 'sem_nf_lancada'
      | 'pedido_sem_itens'

    const solicitacoes = (solRaw || []).map((s: any) => {
      const itens = (s.itens || []) as any[]
      const nfs = (s.nfs || []) as any[]
      const problemas: ProblemFlag[] = []

      if (itens.length === 0) problemas.push('pedido_sem_itens')
      const itensSemDet = itens.filter(i => !i.detalhamento_id)
      if (itensSemDet.length > 0) problemas.push('item_sem_detalhamento_id')

      const itensForaDaMedicao = itens.filter(
        i => i.detalhamento_id && !detIdsMedicao.has(i.detalhamento_id),
      )
      if (itensForaDaMedicao.length > 0) problemas.push('detalhamento_id_nao_existe_na_medicao')

      if (nfs.length === 0) problemas.push('sem_nf_lancada')

      const totalSol = itens.reduce((acc, i) => acc + Number(i.valor_total ?? 0), 0)
      const totalNfs = nfs.reduce((acc, nf) => acc + Number(nf.valor ?? 0), 0)

      return {
        id: s.id,
        numero_pedido_fip: s.numero_pedido_fip,
        status: s.status,
        valor_total_solicitacao: Number(s.valor_total ?? 0),
        soma_itens: totalSol,
        soma_nfs: totalNfs,
        itens: itens.map((i: any) => ({
          id: i.id,
          detalhamento_id: i.detalhamento_id,
          codigo: i.detalhamento?.codigo ?? null,
          descricao: i.detalhamento?.descricao ?? null,
          valor_total: Number(i.valor_total ?? 0),
          qtde_solicitada: Number(i.qtde_solicitada ?? 0),
          valor_unitario: Number(i.valor_unitario ?? 0),
          batendo_com_medicao: i.detalhamento_id ? detIdsMedicao.has(i.detalhamento_id) : false,
        })),
        nfs: nfs.map((nf: any) => ({
          id: nf.id,
          valor: Number(nf.valor ?? 0),
          status: nf.status,
        })),
        problemas,
      }
    })

    // 3) Resumo agregado
    const detIdsSolicitacoes = new Set<string>()
    for (const s of solicitacoes) {
      for (const it of s.itens) {
        if (it.detalhamento_id) detIdsSolicitacoes.add(it.detalhamento_id)
      }
    }

    const detIdsCompartilhados = Array.from(detIdsMedicao).filter(d => detIdsSolicitacoes.has(d))
    const detIdsSoNaMedicao = Array.from(detIdsMedicao).filter(d => !detIdsSolicitacoes.has(d))
    const detIdsSoNasSolicitacoes = Array.from(detIdsSolicitacoes).filter(d => !detIdsMedicao.has(d))

    return NextResponse.json({
      contrato_id: contratoId,
      medicao_id: medicaoId,
      resumo: {
        qtd_itens_medicao: detalhamentosMedicao.length,
        qtd_solicitacoes_aprovadas: solicitacoes.length,
        qtd_det_ids_medicao: detIdsMedicao.size,
        qtd_det_ids_solicitacoes: detIdsSolicitacoes.size,
        qtd_det_ids_compartilhados: detIdsCompartilhados.length,
        det_ids_so_na_medicao: detIdsSoNaMedicao,
        det_ids_so_nas_solicitacoes: detIdsSoNasSolicitacoes,
      },
      detalhamentos_medicao: detalhamentosMedicao,
      solicitacoes_aprovadas: solicitacoes,
    })
  } catch (e: any) {
    // Rota de debug — expõe erro detalhado pra diagnóstico
    return NextResponse.json(
      {
        error: 'debug-route-failed',
        message: e?.message ?? String(e),
        code: e?.code ?? null,
        details: e?.details ?? null,
        hint: e?.hint ?? null,
        stack: typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 8) : null,
      },
      { status: 500 },
    )
  }
}
