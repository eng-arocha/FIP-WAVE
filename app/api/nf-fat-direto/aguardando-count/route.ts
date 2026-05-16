import { NextResponse } from 'next/server'
import { assertPermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSchemaMissingError } from '@/lib/db/resilient'

export const dynamic = 'force-dynamic'

/**
 * GET — contagem de NFs aguardando aprovação. Usado pelo badge da sidebar.
 * Só quem tem `nf_fat_direto:aprovar` enxerga a fila; sem permissão → 0.
 * Resiliente: se a migration 065 ainda não rodou (status legado), retorna 0.
 */
export async function GET() {
  try {
    const auth = await assertPermissao('nf_fat_direto', 'aprovar')
    if (!auth.ok) return NextResponse.json({ count: 0 })

    const admin = createAdminClient()
    const { count, error } = await admin
      .from('notas_fiscais_fat_direto')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'aguardando_aprovacao')

    if (error) {
      // Schema antigo / coluna ausente — não quebra o badge.
      if (isSchemaMissingError(error, ['status'])) return NextResponse.json({ count: 0 })
      throw error
    }
    return NextResponse.json({ count: count ?? 0 })
  } catch {
    // Badge é cosmético — qualquer falha vira contagem 0.
    return NextResponse.json({ count: 0 })
  }
}
