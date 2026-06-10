import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { log } from '@/lib/log'

// GET /api/fat-direto/documentos
//
// Query params aceitos:
//   - view: 'com-nf' (só com NF anexada) | 'aprovadas' (todos aprovados) | '' (padrão)
//   - data_inicio, data_fim: por padrão filtra data_solicitacao; para
//     views 'aprovadas' e 'com-nf' filtra data_aprovacao (faz mais sentido
//     no contexto de histórico de aprovação / NF — a data relevante é
//     quando o pedido foi aprovado, não quando o rascunho foi criado).
//   - nf_numero (ilike)
//   - contrato_id
//   - status_documento
//   - solicitante_id, aprovador_id (filtros individuais)
//
// Retorna pedidos com join em perfis para trazer nome do solicitante e
// do aprovador (usados pelas colunas novas da tela de NF Fat Direto).
// Filtra automaticamente os soft-deleted (deletado_em IS NULL).
//
// RESILIÊNCIA: o select completo depende de colunas de migrations
// posteriores (013 = pedido_pdf/nf/status_documento, 039 = numero_pedido_fip,
// 025 = deletado_em). Se o schema do Supabase ainda não tem alguma delas
// (migration pendente / schema cache stale), cai em selects degradados em
// vez de devolver 500 e deixar a página vazia. Catch-up SQL: migration 070.

// IMPORTANTE: disambiguação explícita das FKs para perfis.
// solicitacoes_fat_direto tem DUAS colunas apontando para perfis
// (solicitante_id e aprovador_id). Sem o !<fk> o PostgREST retorna
// erro "embedding disambiguation", deixando a página vazia.
const SELECT_COMPLETO = `
  id, numero, status, data_solicitacao, data_aprovacao, valor_total,
  fornecedor_razao_social, fornecedor_cnpj, numero_pedido_fip,
  pedido_pdf_url, pedido_pdf_nome,
  nf_numero, nf_data, nf_pdf_url,
  status_documento, created_at,
  solicitante_id, aprovador_id,
  contrato:contratos(id, numero, descricao),
  solicitante:perfis!solicitante_id(id, nome, email),
  aprovador:perfis!aprovador_id(id, nome, email)
`

// Sem as colunas de documentos (migrations 013/025/039 pendentes)
const SELECT_SEM_DOCS = `
  id, numero, status, data_solicitacao, data_aprovacao, valor_total,
  fornecedor_razao_social, fornecedor_cnpj, created_at,
  solicitante_id, aprovador_id,
  contrato:contratos(id, numero, descricao),
  solicitante:perfis!solicitante_id(id, nome, email),
  aprovador:perfis!aprovador_id(id, nome, email)
`

// Último recurso: sem embeds de perfis (FK hint não resolvido pelo PostgREST)
const SELECT_MINIMO = `
  id, numero, status, data_solicitacao, data_aprovacao, valor_total,
  fornecedor_razao_social, fornecedor_cnpj, created_at,
  solicitante_id, aprovador_id,
  contrato:contratos(id, numero, descricao)
`

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

    // Filtro de data:
    //   - View padrão (rascunhos/outros): aplica em data_solicitacao no servidor.
    //   - Views aprovadas/com-nf: NÃO filtra no servidor — o client aplica
    //     usando coalesce(data_aprovacao, data_solicitacao, created_at).
    //     Motivo: registros legados podem ter data_aprovacao=NULL e seriam
    //     excluídos pelo filtro server-side. Cliente é mais flexível.
    const usaDataAprov = view === 'aprovadas' || view === 'com-nf'

    // `temDocCols`: se false, pula filtros que dependem das colunas de
    // documentos (status_documento / nf_numero) — melhor devolver tudo
    // aprovado do que errar de novo no fallback.
    function montarQuery(select: string, temDocCols: boolean) {
      let query = admin
        .from('solicitacoes_fat_direto')
        .select(select)
        .eq('status', 'aprovado')
        .order('data_solicitacao', { ascending: false })

      // View do dashboard: "com-nf" só mostra pedidos que já têm NF anexada.
      // "aprovadas" = todos os aprovados (comportamento padrão do endpoint).
      if (view === 'com-nf' && temDocCols) {
        query = query.in('status_documento', ['nf_recebida', 'pago'])
      }
      if (!usaDataAprov) {
        if (dataInicio) query = query.gte('data_solicitacao', dataInicio)
        if (dataFim) query = query.lte('data_solicitacao', dataFim + 'T23:59:59')
      }
      if (nfNumero && temDocCols) query = query.ilike('nf_numero', `%${nfNumero}%`)
      if (contratoId) query = query.eq('contrato_id', contratoId)
      if (statusDoc && temDocCols) query = query.eq('status_documento', statusDoc)
      if (solicitanteId) query = query.eq('solicitante_id', solicitanteId)
      if (aprovadorId)   query = query.eq('aprovador_id', aprovadorId)
      return query
    }

    let { data, error } = await montarQuery(SELECT_COMPLETO, true)

    if (error && isSchemaMissingError(error, [
      'status_documento', 'pedido_pdf_url', 'pedido_pdf_nome',
      'nf_numero', 'nf_data', 'nf_pdf_url', 'numero_pedido_fip', 'deletado_em',
    ])) {
      log.warn('fat_direto_documentos_fallback_sem_docs', { originalError: error?.message })
      ;({ data, error } = await montarQuery(SELECT_SEM_DOCS, false))
    }

    if (error && isSchemaMissingError(error, ['perfis', 'solicitante', 'aprovador'])) {
      log.warn('fat_direto_documentos_fallback_minimo', { originalError: error?.message })
      ;({ data, error } = await montarQuery(SELECT_MINIMO, false))
    }

    if (error) return apiError(error)

    // Filtra soft-deleted no código (não falha se a coluna ainda não existe)
    // e normaliza defaults pros campos que os selects degradados não trazem.
    const ativos = ((data ?? []) as any[])
      .filter((d: any) => !d.deletado_em)
      .map((d: any) => ({
        numero_pedido_fip: null,
        pedido_pdf_url: null,
        pedido_pdf_nome: null,
        nf_numero: null,
        nf_data: null,
        nf_pdf_url: null,
        status_documento: 'pendente_nf',
        solicitante: null,
        aprovador: null,
        ...d,
      }))
    return NextResponse.json(ativos)
  } catch (e: any) {
    return apiError(e)
  }
}
