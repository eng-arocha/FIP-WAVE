import { NextResponse } from 'next/server'
import { listarSolicitacoesAprovadas } from '@/lib/db/fat-direto'

export async function GET() {
  try {
    const solicitacoes = await listarSolicitacoesAprovadas()
    return NextResponse.json(solicitacoes)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
