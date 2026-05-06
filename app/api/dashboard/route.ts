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
      retencoesQuery,
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
      admin.from('notas_fiscais_fat_direto').select('valor, status').neq('status', 'rejeitada'),
      // Retenção acumulada (medição 051) — resiliente caso schema cache stale
      admin.from('medicoes').select('valor_retencao_garantia').eq('status', 'aprovado'),
    ])

    // NFs de solicitações aprovadas (para Medição Fat. Direto legado)
    let totalNfFatDireto = 0
    if (solsAprovadas && solsAprovadas.length > 0) {
      const solIds = solsAprovadas.map((s: any) => s.id)
      const { data: nfsAprov } = await admin
        .from('notas_fiscais_fat_direto')
        .select('valor, status')
        .in('solicitacao_id', solIds)
        .neq('status', 'rejeitada')
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

    const { data: movimentos, error: movErr } = await admin
      .from('retencao_movimentos')
      .select('contrato_id, tipo, valor, origem_tipo, origem_id')

    let temLivroRazao = false
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

    // Sem livro-razão (062 nao aplicada ou contratos antigos sem movimentos):
    // fallback que estima retenção via 5% × valor_total das medicoes aprovadas.
    if (!temLivroRazao) {
      // Pega contratos ativos com pct_retencao
      const { data: contratosPct } = await admin
        .from('contratos')
        .select('id, percentual_retencao')
        .eq('status', 'ativo')
      const pctMap = new Map<string, number>()
      for (const c of (contratosPct || []) as any[]) {
        pctMap.set(c.id, Number(c.percentual_retencao ?? 5))
      }
      const { data: medsAprov } = await admin
        .from('medicoes')
        .select('id, contrato_id, valor_total, valor_retencao_garantia')
        .eq('status', 'aprovado')
      let total = 0
      const meds = new Set<string>()
      for (const m of (medsAprov || []) as any[]) {
        const fromCol = Number(m.valor_retencao_garantia || 0)
        const pct = pctMap.get(m.contrato_id) ?? 5
        const fromEstim = Math.round(Number(m.valor_total || 0) * (pct / 100) * 100) / 100
        const v = fromCol > 0 ? fromCol : fromEstim
        if (v > 0) {
          total += v
          meds.add(m.id)
        }
      }
      totalRetencao = total
      qtdMedicoesComRetencao = meds.size
    }

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
    })
  } catch (e: any) {
    return apiError(e)
  }
}
