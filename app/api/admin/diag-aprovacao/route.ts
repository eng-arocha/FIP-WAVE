import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/diag-aprovacao?contrato_id=...
 *
 * Diagnostico pos-aprovacao: lista as ultimas medicoes aprovadas e as
 * solicitacoes_fat_direto recentes (todos os status) pra ver se os
 * rascunhos auto-criados na aprovacao realmente existem no banco.
 *
 * Tambem checa, pra a ultima medicao aprovada, quantos itens tinham
 * fip_faturar/wave_servico > 0 (= deviam virar rascunho).
 */

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const contratoId = url.searchParams.get('contrato_id') ||
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const admin = createAdminClient()

    // Ultimas 5 medicoes do contrato
    const { data: medicoes, error: errMed } = await admin
      .from('medicoes')
      .select('id, numero, status, data_submissao, data_aprovacao, valor_total, periodo_referencia')
      .eq('contrato_id', contratoId)
      .order('numero', { ascending: false })
      .limit(5)
    if (errMed) throw errMed

    // Solicitacoes fat-direto recentes (todos os status, incluindo rascunho)
    const { data: solicitacoes, error: errSol } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, numero, status, data_solicitacao, valor_total, fornecedor_razao_social, fornecedor_cnpj, observacoes, solicitante_id')
      .eq('contrato_id', contratoId)
      .order('data_solicitacao', { ascending: false })
      .limit(15)
    if (errSol) throw errSol

    // Pra cada solicitacao, conta itens
    const solDetalhada: any[] = []
    for (const s of (solicitacoes || []) as any[]) {
      const { count } = await admin
        .from('itens_solicitacao_fat_direto')
        .select('id', { count: 'exact', head: true })
        .eq('solicitacao_id', s.id)
      solDetalhada.push({ ...s, qtd_itens: count ?? 0 })
    }

    // Pra a ultima medicao aprovada, calcula se ha itens que deveriam
    // ter virado rascunho (via informacon-data)
    const ultimaAprovada = (medicoes || []).find((m: any) => m.data_aprovacao)
    let analiseUltima: any = null
    if (ultimaAprovada) {
      try {
        const { calcularInformaconData } = await import('@/lib/db/informacon-data')
        const inf = await calcularInformaconData(admin, contratoId, (ultimaAprovada as any).id)
        if (inf) {
          const itensFip = inf.linhas.filter((l: any) => l.fip_faturar > 0)
          const itensWave = inf.linhas.filter((l: any) => l.wave_servico > 0)
          analiseUltima = {
            medicao_id: (ultimaAprovada as any).id,
            numero: (ultimaAprovada as any).numero,
            qtd_linhas_fip_faturar_gt_0: itensFip.length,
            soma_fip_faturar: itensFip.reduce((s: number, l: any) => s + l.fip_faturar, 0),
            qtd_linhas_wave_servico_gt_0: itensWave.length,
            soma_wave_servico: itensWave.reduce((s: number, l: any) => s + l.wave_servico, 0),
            base_retencao: inf.totais.base_retencao,
            retencao: inf.totais.retencao,
          }
        } else {
          analiseUltima = { erro: 'calcularInformaconData retornou null' }
        }
      } catch (e: any) {
        analiseUltima = { erro: 'falha ao calcular informacon: ' + e?.message }
      }
    }

    // Saldo de retencao atual
    let saldoRetencao: any = null
    try {
      const { getSaldoRetencao, listarMovimentosRetencao } = await import('@/lib/db/retencao')
      saldoRetencao = {
        saldo: await getSaldoRetencao(admin, contratoId),
        movimentos: (await listarMovimentosRetencao(admin, contratoId, 10)).map((m: any) => ({
          tipo: m.tipo, origem: m.origem_tipo, valor: m.valor, saldo_apos: m.saldo_apos,
          desc: m.descricao, criado: m.created_at,
        })),
      }
    } catch (e: any) {
      saldoRetencao = { erro: e?.message }
    }

    return NextResponse.json({
      contrato_id: contratoId,
      medicoes,
      solicitacoes_fat_direto: solDetalhada,
      analise_ultima_aprovada: analiseUltima,
      retencao: saldoRetencao,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
