import { NextResponse } from 'next/server'
import { getSolicitacao } from '@/lib/db/fat-direto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const ADMIN_EMAILS = ['eng.arocha@gmail.com']

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    return NextResponse.json(await getSolicitacao(solId))
  } catch (e: any) {
    return apiError(e)
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params
    const body = await req.json()
    const admin = createAdminClient()

    // Atualiza dados do cabeçalho
    const headerUpdate: Record<string, unknown> = {
      fornecedor_razao_social: body.fornecedor_razao_social,
      fornecedor_cnpj: body.fornecedor_cnpj,
      fornecedor_contato: body.fornecedor_contato,
      fornecedor_contato_nome: body.fornecedor_contato_nome,
      fornecedor_contato_telefone: body.fornecedor_contato_telefone,
      observacoes: body.observacoes,
      numero_pedido_fip: body.numero_pedido_fip,
      valor_total: (body.itens as any[]).reduce((s: number, i: any) => s + (parseFloat(i.valor_total) || 0), 0),
    }
    // Permite atualizar lista de anexos (remoção pelo usuário no edit)
    if (Array.isArray(body.pedido_anexos)) {
      headerUpdate.pedido_anexos = body.pedido_anexos
      // Mantém compatibilidade: espelha primeiro anexo em pedido_pdf_url/_nome, ou limpa se vazio
      const first = body.pedido_anexos[0]
      headerUpdate.pedido_pdf_url = first?.url ?? null
      headerUpdate.pedido_pdf_nome = first?.nome ?? null
    }
    const { error: errSol } = await admin
      .from('solicitacoes_fat_direto')
      .update(headerUpdate)
      .eq('id', solId)
    if (errSol) throw errSol

    // Substitui todos os itens
    await admin.from('itens_solicitacao_fat_direto').delete().eq('solicitacao_id', solId)
    const novosItens = (body.itens as any[]).map((it: any) => ({
      solicitacao_id: solId,
      tarefa_id: it.tarefa_id,
      detalhamento_id: it.detalhamento_id || null,
      descricao: it.descricao,
      local: it.local,
      qtde_solicitada: 1,
      valor_unitario: parseFloat(it.valor_total) || 0,
    }))
    const { error: errItens } = await admin.from('itens_solicitacao_fat_direto').insert(novosItens)
    if (errItens) throw errItens

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; solId: string }> },
) {
  try {
    const { solId } = await params

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    let isAdmin = ADMIN_EMAILS.includes(user.email ?? '')
    if (!isAdmin) {
      const admin = createAdminClient()
      const { data: perfil } = await admin
        .from('perfis').select('perfil').eq('id', user.id).single()
      isAdmin = perfil?.perfil === 'admin'
    }

    if (!isAdmin) {
      return NextResponse.json({ error: 'Apenas administradores podem deletar solicitações' }, { status: 403 })
    }

    const admin = createAdminClient()
    await admin.from('itens_solicitacao_fat_direto').delete().eq('solicitacao_id', solId)
    await admin.from('notas_fiscais_fat_direto').delete().eq('solicitacao_id', solId)
    const { error } = await admin.from('solicitacoes_fat_direto').delete().eq('id', solId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return apiError(e)
  }
}

