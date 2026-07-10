import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/reload-schema-cache
 *
 * Dispara `NOTIFY pgrst, 'reload schema'` no Postgres, que forca o
 * PostgREST a recarregar o schema cache. Util quando uma migration acaba
 * de criar uma tabela/coluna e a nova entidade ainda nao foi descoberta
 * pelo cache do API.
 */

async function reloadSchema(): Promise<Response> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.rpc('exec_sql', {
      p_sql: "NOTIFY pgrst, 'reload schema';",
    })
    if (error) {
      return NextResponse.json({ ok: false, erro: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, mensagem: 'NOTIFY pgrst reload schema enviado.' })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET() {
  const negado = await requireAdmin()
  if (negado) return negado
  return reloadSchema()
}

export async function POST() {
  const negado = await requireAdmin()
  if (negado) return negado
  return reloadSchema()
}
