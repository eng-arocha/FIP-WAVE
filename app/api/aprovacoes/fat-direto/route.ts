import { NextResponse } from 'next/server'
import { listarSolicitacoesPendentes } from '@/lib/db/fat-direto'

export async function GET() {
  try {
    const pendentes = await listarSolicitacoesPendentes()
    return NextResponse.json({ pendentes })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
