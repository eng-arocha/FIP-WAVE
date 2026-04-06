import { NextResponse } from 'next/server'
import { runMigrations } from '@/lib/db/auto-migrate'

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.replace('Bearer ', '')
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!token || token !== expected) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  try {
    await runMigrations()
    return NextResponse.json({ ok: true, message: 'Migrations executadas com sucesso.' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    info: 'Auto-migration endpoint. Use POST com Authorization: Bearer {SERVICE_ROLE_KEY} para forçar re-execução.',
  })
}
