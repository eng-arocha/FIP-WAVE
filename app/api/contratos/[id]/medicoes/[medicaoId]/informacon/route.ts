import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { calcularInformaconData } from '@/lib/db/informacon-data'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/informacon
 *
 * Retorna o "boletim INFORMAKON" — planilha-resumo da medição com lógica
 * Wave/FIP por item. A computação fica em lib/db/informacon-data pra que
 * outros consumidores (rota aprovar, email-preview) chamem direto sem
 * passar por HTTP.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()
    const data = await calcularInformaconData(admin, contratoId, medicaoId)
    if (!data) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
