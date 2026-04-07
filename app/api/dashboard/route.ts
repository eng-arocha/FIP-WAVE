import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const [{ data: contratos }, { data: medicoesPendentes }, { data: grupos }, { data: solsAprovadas }] = await Promise.all([
      supabase.from('vw_resumo_contrato').select('*'),
      supabase.from('medicoes')
        .select(`*, contrato:contratos(id, numero, descricao)`)
        .in('status', ['submetido', 'em_analise', 'aprovado', 'rejeitado'])
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('vw_medicao_grupo').select('*'),
      admin.from('solicitacoes_fat_direto').select('id').eq('status', 'aprovado'),
    ])

    // Sum NFs from approved solicitations (excluding rejected NFs)
    let totalNfFatDireto = 0
    if (solsAprovadas && solsAprovadas.length > 0) {
      const solIds = solsAprovadas.map((s: any) => s.id)
      const { data: nfs } = await admin
        .from('notas_fiscais_fat_direto')
        .select('valor, status')
        .in('solicitacao_id', solIds)
        .neq('status', 'rejeitada')
      totalNfFatDireto = (nfs || []).reduce((acc: number, nf: any) => acc + (nf.valor || 0), 0)
    }

    return NextResponse.json({
      contratos: contratos || [],
      medicoes_recentes: medicoesPendentes || [],
      grupos: grupos || [],
      total_nf_fat_direto: totalNfFatDireto,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
