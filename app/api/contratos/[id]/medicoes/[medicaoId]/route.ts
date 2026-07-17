import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { getMedicao } from '@/lib/db/medicoes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const ADMIN_EMAILS = ['eng.arocha@gmail.com']

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (ADMIN_EMAILS.includes(user.email ?? '')) return user
  const admin = createAdminClient()
  const { data } = await admin.from('perfis').select('perfil').eq('id', user.id).single()
  return data?.perfil === 'admin' ? user : null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  try {
    const { medicaoId } = await params
    return NextResponse.json(await getMedicao(medicaoId))
  } catch (e: any) {
    return apiError(e)
  }
}

// PATCH: desaprovar (volta para submetido) — admin.
// Exceção: o CRIADOR pode submeter o próprio rascunho (rascunho → submetido),
// fluxo da "prévia completa" (simulação) da Nova Medição.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { medicaoId } = await params
    const { status } = await req.json()

    const admin = createAdminClient()
    const user = await checkAdmin()

    if (!user) {
      // Não-admin: só rascunho → submetido, pelo próprio solicitante
      const supabase = await createClient()
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
      const { data: medicao } = await admin
        .from('medicoes')
        .select('solicitante_email, status')
        .eq('id', medicaoId)
        .single()
      if (!medicao) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })
      const podeSubmeter =
        status === 'submetido' &&
        medicao.status === 'rascunho' &&
        medicao.solicitante_email === u.email
      if (!podeSubmeter) {
        return NextResponse.json({ error: 'Apenas administradores' }, { status: 403 })
      }
      const { error } = await admin
        .from('medicoes')
        .update({ status: 'submetido', data_submissao: new Date().toISOString() })
        .eq('id', medicaoId)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    // Admin: transição livre, limpando campos de aprovação (desaprovar).
    // Rascunho → submetido também atualiza a data de submissão; desaprovar
    // (aprovado → submetido) preserva a data original.
    const patch: Record<string, unknown> = { status, aprovador_nome: null, aprovador_email: null, data_aprovacao: null }
    if (status === 'submetido') {
      const { data: atual } = await admin.from('medicoes').select('status').eq('id', medicaoId).single()
      if (atual?.status === 'rascunho') patch.data_submissao = new Date().toISOString()
    }
    const { error } = await admin.from('medicoes').update(patch).eq('id', medicaoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

// DELETE: excluir medição (admin sempre; criador se ainda não aprovada/em_analise)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { medicaoId } = await params
    const admin = createAdminClient()

    const isAdmin = await checkAdmin().then(u => u !== null)
    if (!isAdmin) {
      const { data: medicao } = await admin
        .from('medicoes')
        .select('solicitante_email, status')
        .eq('id', medicaoId)
        .single()
      if (!medicao) return NextResponse.json({ error: 'Medição não encontrada' }, { status: 404 })
      const criadorPodeExcluir =
        medicao.solicitante_email === user.email &&
        !['aprovado', 'em_analise'].includes(medicao.status)
      if (!criadorPodeExcluir)
        return NextResponse.json({ error: 'Sem permissão para excluir esta medição' }, { status: 403 })
    }

    // Cascade ON DELETE na FK já remove medicao_itens, medicao_anexos e aprovacoes
    const { error } = await admin.from('medicoes').delete().eq('id', medicaoId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}
