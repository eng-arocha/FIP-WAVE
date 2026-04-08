import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    return NextResponse.json({
      contratos: contratos || [],
      medicoes_recentes: medicoesPendentes || [],
      grupos: grupos || [],
      total_nf_fat_direto: totalNfFatDireto,
      total_nfs_lancadas: totalNfsLancadas,
      total_sol_aprovadas: totalSolAprovadas,
      valor_servicos: valorServicos,
      valor_material_direto: valorMaterialDireto,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
