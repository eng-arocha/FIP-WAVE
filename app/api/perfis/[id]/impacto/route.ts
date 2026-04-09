import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'

/**
 * GET /api/perfis/[id]/impacto
 * Retorna quantos usuários seriam afetados por uma edição neste template:
 *   - total: todos os usuários ligados ao template
 *   - afetados: só os que herdam (permissoes_customizadas = false)
 *   - ilhas: os que têm customização própria (não serão afetados)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const admin = createAdminClient()

    const { count: total } = await admin
      .from('perfis')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id)

    // Tenta separar afetados × ilhas. Se a coluna não existe ainda,
    // assume tudo como afetado (permissoes_customizadas = false por padrão).
    let afetados = total ?? 0
    let ilhas = 0

    const r = await admin
      .from('perfis')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id)
      .eq('permissoes_customizadas', true)

    if (!r.error) {
      ilhas = r.count ?? 0
      afetados = (total ?? 0) - ilhas
    }

    return NextResponse.json({
      total: total ?? 0,
      afetados,
      ilhas,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
