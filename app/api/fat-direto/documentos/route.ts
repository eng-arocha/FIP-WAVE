import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/fat-direto/documentos
//
// Query params aceitos:
//   - view: 'com-nf' (só com NF anexada) | 'aprovadas' (todos aprovados) | '' (padrão)
//   - data_inicio, data_fim (data_solicitacao)
//   - nf_numero (ilike)
//   - contrato_id
//   - status_documento
//   - solicitante_id, aprovador_id (filtros individuais)
//
// Retorna pedidos com join em perfis para trazer nome do solicitante e
// do aprovador (usados pelas colunas novas da tela de NF Fat Direto).
// Filtra automaticamente os soft-deleted (deletado_em IS NULL).
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const view = searchParams.get('view') ?? ''
    const dataInicio = searchParams.get('data_inicio')
    const dataFim = searchParams.get('data_fim')
    const nfNumero = searchParams.get('nf_numero')
    const contratoId = searchParams.get('contrato_id')
    const statusDoc = searchParams.get('status_documento')
    const solicitanteId = searchParams.get('solicitante_id')
    const aprovadorId   = searchParams.get('aprovador_id')

    const admin = createAdminClient()
    // IMPORTANTE: disambiguação explícita das FKs para perfis.
    // solicitacoes_fat_direto tem DUAS colunas apontando para perfis
    // (solicitante_id e aprovador_id). Sem o !<fk> o PostgREST retorna
    // erro "embedding disambiguation", deixando a página vazia.
    let query = admin
      .from('solicitacoes_fat_direto')
      .select(`
        id, numero, status, data_solicitacao, data_aprovacao, valor_total,
        fornecedor_razao_social, fornecedor_cnpj, numero_pedido_fip,
        pedido_pdf_url, pedido_pdf_nome,
        nf_numero, nf_data, nf_pdf_url,
        status_documento, created_at,
        solicitante_id, aprovador_id,
        contrato:contratos(id, numero, descricao),
        solicitante:perfis!solicitante_id(id, nome, email),
        aprovador:perfis!aprovador_id(id, nome, email)
      `)
      .eq('status', 'aprovado')
      .order('data_solicitacao', { ascending: false })

    // View do dashboard: "com-nf" só mostra pedidos que já têm NF anexada
    if (view === 'com-nf') {
      query = query.in('status_documento', ['nf_recebida', 'pago'])
    }
    // "aprovadas" = todos os aprovados (comportamento padrão do endpoint)

    if (dataInicio) query = query.gte('data_solicitacao', dataInicio)
    if (dataFim) query = query.lte('data_solicitacao', dataFim + 'T23:59:59')
    if (nfNumero) query = query.ilike('nf_numero', `%${nfNumero}%`)
    if (contratoId) query = query.eq('contrato_id', contratoId)
    if (statusDoc) query = query.eq('status_documento', statusDoc)
    if (solicitanteId) query = query.eq('solicitante_id', solicitanteId)
    if (aprovadorId)   query = query.eq('aprovador_id', aprovadorId)

    const { data, error } = await query
    if (error) {
      // Se o erro menciona deletado_em ou solicitante/aprovador, pode ser
      // que as migrations 005 (FKs) ou 025 (soft-delete) ainda não rodaram.
      // Reporta como 500 com a mensagem original para facilitar diagnóstico.
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Filtra soft-deleted no código (não falha se a coluna ainda não existe)
    const ativos = (data ?? []).filter((d: any) => !d.deletado_em)
    return NextResponse.json(ativos)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
