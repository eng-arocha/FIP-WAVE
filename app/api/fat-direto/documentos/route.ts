import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const dataInicio = searchParams.get('data_inicio')
    const dataFim = searchParams.get('data_fim')
    const nfNumero = searchParams.get('nf_numero')
    const contratoId = searchParams.get('contrato_id')
    const statusDoc = searchParams.get('status_documento')

    const admin = createAdminClient()
    let query = admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, status, data_solicitacao, valor_total,
        fornecedor_razao_social, fornecedor_cnpj, numero_pedido_fip,
        pedido_pdf_url, pedido_pdf_nome,
        nf_numero, nf_data, nf_pdf_url,
        status_documento, created_at,
        contrato:contrato_id(id, codigo, nome)
      `)
      .eq('status', 'aprovado')
      .order('data_solicitacao', { ascending: false })

    if (dataInicio) query = query.gte('data_solicitacao', dataInicio)
    if (dataFim) query = query.lte('data_solicitacao', dataFim + 'T23:59:59')
    if (nfNumero) query = query.ilike('nf_numero', `%${nfNumero}%`)
    if (contratoId) query = query.eq('contrato_id', contratoId)
    if (statusDoc) query = query.eq('status_documento', statusDoc)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
