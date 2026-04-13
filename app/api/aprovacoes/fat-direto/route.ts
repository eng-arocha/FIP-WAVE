import { NextResponse } from 'next/server'
import { listarSolicitacoesPendentes } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const pendentes = await listarSolicitacoesPendentes()
    return NextResponse.json({ pendentes })
  } catch (e: any) {
    return apiError(e)
  }
}
