import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularInformaconData } from '@/lib/db/informacon-data'

// ROTA TEMPORÁRIA DE DEBUG — retorna stack trace completo em vez de mascarar.
// Use apenas pra investigar 500 do /informacon. Remover depois.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()
    const data = await calcularInformaconData(admin, contratoId, medicaoId)
    return NextResponse.json({ ok: true, hasData: !!data, linhas_count: data?.linhas.length ?? 0 })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: {
        message: e?.message ?? String(e),
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        stack: e?.stack?.split('\n').slice(0, 12).join('\n'),
        cause: e?.cause ? String(e.cause) : undefined,
      },
    }, { status: 200 })
  }
}
