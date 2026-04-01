import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const [{ data: contratos }, { data: medicoesPendentes }, { data: grupos }] = await Promise.all([
      supabase.from('vw_resumo_contrato').select('*'),
      supabase.from('medicoes')
        .select(`*, contrato:contratos(id, numero, descricao)`)
        .in('status', ['submetido', 'em_analise', 'aprovado', 'rejeitado'])
        .order('created_at', { ascending: false })
        .limit(8),
      supabase.from('vw_medicao_grupo').select('*'),
    ])

    return NextResponse.json({
      contratos: contratos || [],
      medicoes_recentes: medicoesPendentes || [],
      grupos: grupos || [],
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
