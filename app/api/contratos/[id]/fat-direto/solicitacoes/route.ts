import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listarSolicitacoes, criarSolicitacao } from '@/lib/db/fat-direto'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await listarSolicitacoes(id))
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const body = await req.json()
    if (!body.itens || !Array.isArray(body.itens) || body.itens.length === 0) {
      return NextResponse.json({ error: 'itens é obrigatório' }, { status: 400 })
    }

    const sol = await criarSolicitacao({
      contrato_id: id,
      solicitante_id: user.id,
      observacoes: body.observacoes,
      numero_pedido_fip: body.numero_pedido_fip ? parseInt(body.numero_pedido_fip, 10) : undefined,
      fornecedor_razao_social: body.fornecedor_razao_social,
      fornecedor_cnpj: body.fornecedor_cnpj,
      fornecedor_contato: body.fornecedor_contato,
      fornecedor_contato_nome: body.fornecedor_contato_nome,
      fornecedor_contato_telefone: body.fornecedor_contato_telefone,
      itens: body.itens,
    })
    return NextResponse.json(sol, { status: 201 })
  } catch (e: any) {
    if (e.message === 'TETO_EXCEDIDO') {
      return NextResponse.json(
        { error: 'TETO_EXCEDIDO', violation: (e as any).violation },
        { status: 422 },
      )
    }
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
