import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { listarSolicitacoes, criarSolicitacao } from '@/lib/db/fat-direto'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid, cnpj } from '@/lib/api/schema'

// Schema do item espelha exatamente o que `criarSolicitacao` espera em
// lib/db/fat-direto.ts. O campo `valor_total` é o total da linha (qtde *
// unitário), calculado no cliente. O DB grava qtde_solicitada=1 e
// valor_unitario=valor_total — convenção interna.
const Item = z.object({
  tarefa_id: uuid(),
  detalhamento_id: uuid().optional(),
  descricao: z.string().min(1).max(1000),
  local: z.string().min(1).max(100),
  valor_total: z.number().positive('Valor da linha deve ser positivo.'),
})

const Body = z.object({
  observacoes: z.string().max(2000).optional(),
  numero_pedido_fip: z.union([z.string(), z.number()]).optional(),
  fornecedor_razao_social: z.string().max(500).optional(),
  fornecedor_cnpj: cnpj().optional(),
  fornecedor_contato: z.string().max(500).optional(),
  fornecedor_contato_nome: z.string().max(500).optional(),
  fornecedor_contato_telefone: z.string().max(50).optional(),
  itens: z.array(Item).min(1, 'Informe pelo menos um item.'),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    return NextResponse.json(await listarSolicitacoes(id))
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const body = parsed.data

    const sol = await criarSolicitacao({
      contrato_id: id,
      solicitante_id: user.id,
      observacoes: body.observacoes,
      numero_pedido_fip: body.numero_pedido_fip ? parseInt(String(body.numero_pedido_fip), 10) : undefined,
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
    if (e.message === 'ITEM_LIMITE_EXCEDIDO') {
      return NextResponse.json(
        { error: 'ITEM_LIMITE_EXCEDIDO', itemViolation: (e as any).itemViolation },
        { status: 422 },
      )
    }
    if (e.message === 'PEDIDO_FIP_DUPLICADO') {
      return NextResponse.json(
        { error: 'PEDIDO_FIP_DUPLICADO', pedidoFipDuplicado: (e as any).pedidoFipDuplicado },
        { status: 409 },
      )
    }
    // Defesa-em-profundidade: se o índice único disparar (race), também devolve 409
    if (e?.code === '23505' && /numero_pedido_fip/.test(String(e?.message ?? ''))) {
      return NextResponse.json(
        { error: 'PEDIDO_FIP_DUPLICADO', pedidoFipDuplicado: null },
        { status: 409 },
      )
    }
    return apiError(e)
  }
}
