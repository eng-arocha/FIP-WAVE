import { NextResponse } from 'next/server'
import { getSolicitacao } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    return NextResponse.json(await getSolicitacao(solId))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params

    // Verificar se é admin
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: perfil } = await supabase
      .from('usuario_perfis')
      .select('perfil')
      .eq('user_id', user.id)
      .single()
    if (perfil?.perfil !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem deletar solicitações' }, { status: 403 })
    }

    const admin = createAdminClient()
    // Deletar itens e NFs primeiro (cascade pode não estar ativo)
    await admin.from('itens_solicitacao_fat_direto').delete().eq('solicitacao_id', solId)
    await admin.from('notas_fiscais_fat_direto').delete().eq('solicitacao_id', solId)
    const { error } = await admin.from('solicitacoes_fat_direto').delete().eq('id', solId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
