import { NextResponse } from 'next/server'
import { getMedicoesPendentes, getMedicoesHistorico } from '@/lib/db/medicoes'

export async function GET() {
  try {
    const [pendentes, historico] = await Promise.all([
      getMedicoesPendentes(),
      getMedicoesHistorico(),
    ])
    return NextResponse.json({ pendentes, historico })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
