import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('medicoes')
      .select('*, contrato:contratos(id, numero, descricao)')
      .eq('tipo', 'servico')
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
