import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const [
      { data: contratos },
      { data: medicoesPendentes },
      { data: grupos },
      { data: solsAprovadas },
      { data: contratosRaw },
      { data: allNfs },
      medicoesAprovadasComItens,
    ] = await Promise.all([
      supabase.from('vw_resumo_contrato').select('*'),
      supabase.from('medicoes')
        .select(`*, contrato:contratos(id, numero, descricao)`)
        .in('status', ['submetido', 'em_analise', 'aprovado', 'rejeitado'])
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('vw_medicao_grupo').select('*'),
      admin.from('solicitacoes_fat_direto').select('id, valor_total').eq('status', 'aprovado'),
      admin.from('contratos').select('valor_servicos, valor_material_direto').eq('status', 'ativo'),
      admin.from('notas_fiscais_fat_direto').select('valor, status').neq('status', 'cancelada'),
      // Medições aprovadas + itens + valor_unit mat/serv pra calcular split
      // 'Medição de Serviço' (= MO) vs 'Fat. Direto Medido' (= material).
      // Source-of-truth pra os 4 cards de medição do dashboard (spec 2026-05-06).
      admin.from('medicoes')
        .select(`id, status, contrato_id,
          medicao_itens (
            quantidade_medida,
            detalhamento:detalhamentos ( valor_material_unit, valor_servico_unit )
          )
        `)
        .eq('status', 'aprovado'),
    ])

    // NFs de solicitações aprovadas (para Medição Fat. Direto legado)
    let totalNfFatDireto = 0
    if (solsAprovadas && solsAprovadas.length > 0) {
      const solIds = solsAprovadas.map((s: any) => s.id)
      const { data: nfsAprov } = await admin
        .from('notas_fiscais_fat_direto')
        .select('valor, status')
        .in('solicitacao_id', solIds)
        .neq('status', 'cancelada')
      totalNfFatDireto = (nfsAprov || []).reduce((acc: number, nf: any) => acc + (nf.valor || 0), 0)
    }

    // Soma de TODAS as NFs lançadas (status != rejeitada)
    const totalNfsLancadas = (allNfs || []).reduce((acc: number, nf: any) => acc + (nf.valor || 0), 0)

    // Soma de solicitações aprovadas (valor_total)
    const totalSolAprovadas = (solsAprovadas || []).reduce((acc: number, s: any) => acc + (s.valor_total || 0), 0)

    // Valor de serviços e material direto dos contratos ativos
    const valorServicos       = (contratosRaw || []).reduce((acc: number, c: any) => acc + (c.valor_servicos || 0), 0)
    const valorMaterialDireto = (contratosRaw || []).reduce((acc: number, c: any) => acc + (c.valor_material_direto || 0), 0)

    // Retenção contratual acumulada — fonte primária: livro-razão
    // (retencao_movimentos, migration 062). Reporta o TOTAL CREDITADO
    // na história (= 5% × tudo que foi medido até hoje), nao o saldo
    // atual (que pode estar zerado por compensações nas NFs Wave).
    // UX: usuário quer ver 'quanto já retive', não 'quanto resta'.
    // Fallback: coluna legacy valor_retencao_garantia (migration 051) +
    // estimativa via 5% × valor_total das medicoes aprovadas, se
    // livro-razão ainda nao tiver entradas.
    let totalRetencao = 0
    let qtdMedicoesComRetencao = 0
    let temLivroRazao = false

    // Tenta RPC pública (migration 064) que bypassa schema cache stale do
    // PostgREST. Fallback: query via PostgREST normal (que pode falhar se
    // o schema cache não tiver visto retencao_movimentos ainda).
    try {
      const { data: rpc, error: rpcErr } = await admin
        .rpc('retencao_dashboard_summary')
        .single()
      if (!rpcErr && rpc) {
        const payload = rpc as any
        totalRetencao = Number(payload.total_creditos || 0)
        qtdMedicoesComRetencao = Number(payload.qtd_medicoes_com_credito || 0)
        temLivroRazao = totalRetencao > 0 || qtdMedicoesComRetencao > 0
      }
    } catch {/* segue pro fallback */}

    if (!temLivroRazao) {
      const { data: movimentos, error: movErr } = await admin
        .from('retencao_movimentos')
        .select('contrato_id, tipo, valor, origem_tipo, origem_id')

      if (!movErr && movimentos && movimentos.length > 0) {
        temLivroRazao = true
        const medicoesComCredito = new Set<string>()
        let totalCreditado = 0
        for (const mv of movimentos as any[]) {
          if (mv.tipo === 'credito') {
            totalCreditado += Number(mv.valor || 0)
            if (mv.origem_tipo === 'medicao_aprovada' && mv.origem_id) {
              medicoesComCredito.add(mv.origem_id)
            }
          }
        }
        totalRetencao = totalCreditado
        qtdMedicoesComRetencao = medicoesComCredito.size
      }
    }

    // Split medição: serviço (MO) × material — calculado a partir de
    // medicao_itens × detalhamentos (mat_unit + servico_unit). Não confia em
    // medicoes.valor_total (que pode ter sido gravado pela fórmula antiga).
    let totalServicoMedido = 0
    let totalMaterialMedido = 0
    const medsAgg = (medicoesAprovadasComItens?.data || []) as any[]
    for (const m of medsAgg) {
      for (const it of (m.medicao_itens || []) as any[]) {
        const qtde = Number(it.quantidade_medida || 0)
        const matUnit = Number(it.detalhamento?.valor_material_unit || 0)
        const servUnit = Number(it.detalhamento?.valor_servico_unit || 0)
        totalMaterialMedido += qtde * matUnit
        totalServicoMedido  += qtde * servUnit
      }
    }
    const totalMedicao = Math.round((totalMaterialMedido + totalServicoMedido) * 100) / 100
    totalMaterialMedido = Math.round(totalMaterialMedido * 100) / 100
    totalServicoMedido  = Math.round(totalServicoMedido  * 100) / 100

    // Sem livro-razão (062 nao aplicada ou RPC ausente): estima retenção
    // como 5% × totalMedicao (FORMULA NOVA spec 2026-05-06 = mat + serv,
    // já calculado acima via split). NÃO usa medicoes.valor_total (formula
    // antiga) que daria número errado pra MED-001 antiga.
    if (!temLivroRazao && totalMedicao > 0) {
      const { data: cPct } = await admin
        .from('contratos')
        .select('percentual_retencao')
        .eq('status', 'ativo')
        .limit(1)
        .single()
      const pct = Number((cPct as any)?.percentual_retencao ?? 5)
      totalRetencao = Math.round(totalMedicao * (pct / 100) * 100) / 100
      qtdMedicoesComRetencao = qtdMedicoesComRetencao || medsAgg.length
    }

    // Retenção prevista total da obra = 5% × valor_total contrato (= mat +
    // serv). NF Wave SPE de retenção emitida no encerramento equivale a 5%
    // de TUDO que foi medido durante a obra.
    const retencaoPrevistaFinal = Math.round((valorServicos + valorMaterialDireto) * 0.05 * 100) / 100

    return NextResponse.json({
      contratos: contratos || [],
      medicoes_recentes: medicoesPendentes || [],
      grupos: grupos || [],
      total_nf_fat_direto: totalNfFatDireto,
      total_nfs_lancadas: totalNfsLancadas,
      total_sol_aprovadas: totalSolAprovadas,
      valor_servicos: valorServicos,
      valor_material_direto: valorMaterialDireto,
      total_retencao_acumulada: totalRetencao,
      qtd_medicoes_com_retencao: qtdMedicoesComRetencao,
      // Novos campos pra cards de medição segregados
      total_servico_medido: totalServicoMedido,
      total_material_medido: totalMaterialMedido,
      total_medicao: totalMedicao,
      retencao_prevista_final: retencaoPrevistaFinal,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
