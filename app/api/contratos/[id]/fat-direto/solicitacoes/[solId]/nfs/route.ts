import { NextResponse } from 'next/server'
import { criarNotaFiscal } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('*')
      .eq('solicitacao_id', solId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const body = await req.json()
    if (!body.numero_nf || !body.valor || !body.data_emissao) {
      return NextResponse.json({ error: 'Campos obrigatórios: numero_nf, valor, data_emissao' }, { status: 400 })
    }
    const nf = await criarNotaFiscal({ ...body, solicitacao_id: solId })
    return NextResponse.json(nf, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
