import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin, getUsuarioLogado } from '@/lib/api/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json()
    const admin = createAdminClient()

    const allowed = ['nf_numero', 'nf_data', 'nf_pdf_url', 'status_documento']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('solicitacoes_fat_direto')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET /api/fat-direto/documentos/[id]
// Retorna um pedido específico (usado pelo fluxo de anexar NF após salvar).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, status, data_solicitacao, data_aprovacao, valor_total,
        fornecedor_razao_social, fornecedor_cnpj, numero_pedido_fip,
        pedido_pdf_url, pedido_pdf_nome,
        nf_numero, nf_data, nf_pdf_url,
        status_documento,
        solicitante_id, aprovador_id,
        contrato:contrato_id(id, codigo, nome),
        solicitante:solicitante_id(id, nome, email),
        aprovador:aprovador_id(id, nome, email)
      `)
      .eq('id', id)
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/fat-direto/documentos/[id]
// Soft-delete — apenas admin. Marca deletado_em + deletado_por.
// O registro continua no banco (auditável, reversível) mas é filtrado
// das listagens no endpoint GET.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: 'Apenas administradores podem excluir pedidos.' }, { status: 403 })
  }
  try {
    const { id } = await params
    const user = await getUsuarioLogado()
    const admin = createAdminClient()

    const { error } = await admin
      .from('solicitacoes_fat_direto')
      .update({
        deletado_em: new Date().toISOString(),
        deletado_por: user?.id ?? null,
      })
      .eq('id', id)

    if (error) {
      // Se a migration 025 ainda não foi aplicada, retorna mensagem clara
      if (/deletado_em|deletado_por/.test(error.message)) {
        return NextResponse.json(
          { error: 'A funcionalidade de exclusão ainda não está ativa. Rode a migration 025 no Supabase SQL Editor.' },
          { status: 503 }
        )
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
