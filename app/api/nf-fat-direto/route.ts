import { NextResponse } from 'next/server'
import { listarSolicitacoesAprovadas } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const solicitacoes = await listarSolicitacoesAprovadas()
    return NextResponse.json(solicitacoes)
  } catch (e: any) {
    return apiError(e)
  }
}
