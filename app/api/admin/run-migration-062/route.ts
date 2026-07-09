import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { runMigrations } from '@/lib/db/auto-migrate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/run-migration-062
 *
 * Aplica a migration 062 (livro-razao retencao_movimentos + RPC
 * aplicar_movimento_retencao). Idempotente: verifica se a tabela ja
 * existe antes; se sim, retorna ok sem fazer nada. Se nao, dispara
 * runMigrations() que aplica via fallback exec_sql RPC.
 *
 * GET retorna o status atual sem aplicar (read-only).
 */

async function checarTabela() {
  const admin = createAdminClient()
  const { error } = await admin
    .from('retencao_movimentos')
    .select('id', { count: 'exact', head: true })
    .limit(1)
  if (error) {
    const msg = error.message || ''
    const naoExiste = msg.toLowerCase().includes('does not exist') ||
      msg.toLowerCase().includes('schema cache') ||
      (error as any).code === '42P01'
    return { existe: !naoExiste, erro: naoExiste ? null : msg }
  }
  return { existe: true, erro: null }
}

export async function GET() {
  const negado = await requireAdmin()
  if (negado) return negado
  try {
    return NextResponse.json(await checarTabela())
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST() {
  const negado = await requireAdmin()
  if (negado) return negado
  try {
    const antes = await checarTabela()
    if (antes.existe) {
      return NextResponse.json({
        ok: true,
        ja_aplicada: true,
        mensagem: 'Migration 062 ja aplicada — tabela retencao_movimentos existe.',
      })
    }

    await runMigrations()

    const depois = await checarTabela()
    if (!depois.existe) {
      return NextResponse.json(
        {
          ok: false,
          erro: 'runMigrations executou mas a tabela ainda nao existe.',
          detalhe: depois.erro,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      ja_aplicada: false,
      mensagem: 'Migration 062 aplicada. retencao_movimentos + RPC criados.',
    })
  } catch (e: any) {
    return apiError(e)
  }
}
