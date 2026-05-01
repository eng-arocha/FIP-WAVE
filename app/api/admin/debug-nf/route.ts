import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/debug-nf
 *
 * Endpoint público de diagnóstico — reproduz o SELECT de
 * listarSolicitacoesAprovadas e retorna o erro completo (PostgREST code,
 * message, hint, details) sem ser mascarado pelo apiError().
 *
 * Útil pra debugar o 500 em /api/nf-fat-direto.
 */
export async function GET() {
  const sb = createAdminClient()

  const baseSelect = `
      id, numero, status, data_solicitacao, data_aprovacao, valor_total,
      fornecedor_razao_social, fornecedor_cnpj,
      contrato_id,
      contrato:contrato_id(id, numero, descricao),
      solicitante:perfis!solicitante_id(nome),
      notas_fiscais:notas_fiscais_fat_direto(id, numero_nf, valor, status),
      itens:itens_solicitacao_fat_direto(id)
    `
  const extraSelect = `${baseSelect}, observacoes, numero_pedido_fip`

  // Tenta primary
  const r1 = await sb
    .from('solicitacoes_fat_direto')
    .select(extraSelect)
    .in('status', ['aprovado', 'aguardando_aprovacao'])
    .order('data_solicitacao', { ascending: false })

  // Tenta fallback
  const r2 = await sb
    .from('solicitacoes_fat_direto')
    .select(baseSelect)
    .in('status', ['aprovado', 'aguardando_aprovacao'])
    .order('data_solicitacao', { ascending: false })

  // Tenta SELECT mínimo
  const r3 = await sb
    .from('solicitacoes_fat_direto')
    .select('id, numero, status')
    .in('status', ['aprovado', 'aguardando_aprovacao'])
    .limit(3)

  return NextResponse.json({
    primary: {
      ok: !r1.error,
      error: r1.error
        ? { code: r1.error.code, message: r1.error.message, details: r1.error.details, hint: r1.error.hint }
        : null,
      count: r1.data?.length ?? 0,
    },
    fallback: {
      ok: !r2.error,
      error: r2.error
        ? { code: r2.error.code, message: r2.error.message, details: r2.error.details, hint: r2.error.hint }
        : null,
      count: r2.data?.length ?? 0,
    },
    minimal: {
      ok: !r3.error,
      error: r3.error
        ? { code: r3.error.code, message: r3.error.message, details: r3.error.details, hint: r3.error.hint }
        : null,
      count: r3.data?.length ?? 0,
      sample: r3.data?.slice(0, 3) ?? null,
    },
  })
}
