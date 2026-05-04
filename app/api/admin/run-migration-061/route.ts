import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { runMigrations } from '@/lib/db/auto-migrate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/run-migration-061
 *
 * Aplica a migration 061 (tabela medicao_item_ajustes). Idempotente:
 * verifica se a tabela já existe antes; se sim, retorna ok sem fazer
 * nada. Se não, dispara o runMigrations() que cuida de aplicar a 061
 * (e qualquer outra pendente) via fallback exec_sql RPC.
 *
 * Acesso: usuário autenticado com permissão `medicoes:aprovar` (mesmos
 * que conseguem ajustar quantidade — alinhado com quem precisa da
 * funcionalidade).
 *
 * GET retorna o status atual sem aplicar (read-only).
 */

async function checarTabela() {
  const admin = createAdminClient()
  // SELECT count(*) com LIMIT 1 — falha rápida se a tabela não existe
  const { error } = await admin
    .from('medicao_item_ajustes')
    .select('id', { count: 'exact', head: true })
    .limit(1)
  if (error) {
    const msg = error.message || ''
    const naoExiste = msg.toLowerCase().includes('does not exist') || (error as any).code === '42P01'
    return { existe: !naoExiste, erro: naoExiste ? null : msg }
  }
  return { existe: true, erro: null }
}

export async function GET() {
  try {
    const status = await checarTabela()
    return NextResponse.json(status)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST() {
  try {
    const check = await assertPermissao('medicoes', 'aprovar')
    if (!check.ok) {
      return NextResponse.json(
        { error: 'Apenas usuários com permissão de aprovação podem disparar migrations.' },
        { status: check.status },
      )
    }

    const antes = await checarTabela()
    if (antes.existe) {
      return NextResponse.json({
        ok: true,
        ja_aplicada: true,
        mensagem: 'Migration 061 já está aplicada — tabela medicao_item_ajustes existe.',
      })
    }

    await runMigrations()

    const depois = await checarTabela()
    if (!depois.existe) {
      return NextResponse.json(
        {
          ok: false,
          erro: 'runMigrations() executou mas a tabela ainda não existe.',
          detalhe: depois.erro,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      ja_aplicada: false,
      mensagem: 'Migration 061 aplicada com sucesso. Tabela medicao_item_ajustes pronta.',
    })
  } catch (e: any) {
    return apiError(e)
  }
}
