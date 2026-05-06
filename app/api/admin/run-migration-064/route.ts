import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { runMigrations } from '@/lib/db/auto-migrate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST/GET /api/admin/run-migration-064
 *
 * Aplica a migration 064 (RPCs retencao_dashboard_summary +
 * retencao_saldo_contrato). Idempotente: tenta chamar a RPC; se 'function
 * does not exist', dispara runMigrations(). Retorna o resultado da RPC
 * pra confirmar que ficou disponível.
 */

async function checarRpc(admin: ReturnType<typeof createAdminClient>) {
  const { data, error } = await admin.rpc('retencao_dashboard_summary').single()
  if (error) {
    const msg = error.message || ''
    const naoExiste =
      msg.toLowerCase().includes('does not exist') ||
      msg.toLowerCase().includes('schema cache') ||
      (error as any).code === '42883' ||
      (error as any).code === 'PGRST202'
    return { existe: !naoExiste, erro: msg, data: null }
  }
  return { existe: true, erro: null, data }
}

async function executar(): Promise<Response> {
  try {
    const admin = createAdminClient()
    const antes = await checarRpc(admin)
    if (antes.existe) {
      return NextResponse.json({
        ok: true,
        ja_aplicada: true,
        resumo: antes.data,
      })
    }

    await runMigrations()

    const depois = await checarRpc(admin)
    if (!depois.existe) {
      return NextResponse.json({
        ok: false,
        erro: 'runMigrations executou mas a RPC ainda não existe',
        detalhe: depois.erro,
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      ja_aplicada: false,
      mensagem: 'Migration 064 aplicada. RPCs retencao_dashboard_summary + retencao_saldo_contrato disponíveis.',
      resumo: depois.data,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET() {
  return executar()
}
export async function POST() {
  return executar()
}
