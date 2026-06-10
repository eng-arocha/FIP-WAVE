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
//
// notas_fiscais join: NFs criadas via fluxo de contratos (criarNotaFiscal)
// são gravadas em notas_fiscais_fat_direto mas NÃO atualizam os campos
// legacy nf_numero/nf_pdf_url/status_documento em solicitacoes_fat_direto.
// Fazemos o join aqui e derivamos esses campos na normalização da resposta,
// cobrindo tanto registros antigos quanto novos.
const SELECT_COMPLETO = `
  id, numero, status, data_solicitacao, data_aprovacao, valor_total,
  fornecedor_razao_social, fornecedor_cnpj, numero_pedido_fip,
  pedido_pdf_url, pedido_pdf_nome,
  nf_numero, nf_data, nf_pdf_url,
  status_documento, created_at,
  solicitante_id, aprovador_id,
  contrato:contratos(id, numero, descricao),
  solicitante:perfis!solicitante_id(id, nome, email),
  aprovador:perfis!aprovador_id(id, nome, email),
  notas_fiscais:notas_fiscais_fat_direto!solicitacao_id(id, numero_nf, arquivo_url, status, data_emissao)
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
        .order('data_solicitacao', { ascending: false })

      // Views aprovadas/com-nf incluem pedidos encerrados (status='encerrado')
      // além dos aprovados — pedidos encerrados já foram pagos/resolvidos e
      // fazem parte do histórico de NFs. View padrão só mostra ativos.
      if (view === 'aprovadas' || view === 'com-nf') {
        query = query.in('status', ['aprovado', 'encerrado'])
      } else {
        query = query.eq('status', 'aprovado')
      }

      // NOTA: o filtro status_documento para view='com-nf' é aplicado em
      // código (após normalização), não em SQL. Motivo: NFs criadas via
      // criarNotaFiscal() ficam em notas_fiscais_fat_direto e não atualizam
      // o campo legacy status_documento — a normalização abaixo deriva o
      // valor correto do join. Filtrar em SQL antes dessa derivação excluiria
      // registros válidos.

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

    let temDocCols = true
    let { data, error } = await montarQuery(SELECT_COMPLETO, true)

    if (error && isSchemaMissingError(error, [
      'status_documento', 'pedido_pdf_url', 'pedido_pdf_nome',
      'nf_numero', 'nf_data', 'nf_pdf_url', 'numero_pedido_fip', 'deletado_em',
      'notas_fiscais_fat_direto',
    ])) {
      temDocCols = false
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
    // Para cada pedido, deriva status_documento e campos NF a partir do join
    // notas_fiscais_fat_direto — cobre NFs criadas via criarNotaFiscal() que
    // não atualizam os campos legacy da solicitação.
    const ativos = ((data ?? []) as any[])
      .filter((d: any) => !d.deletado_em)
      .map((d: any) => {
        const rec: any = {
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
        }

        // Deriva status_documento e campos NF a partir do join.
        // NFs ativas = aprovadas ou aguardando_aprovacao (reservam saldo).
        const nfsJoin: any[] = Array.isArray(rec.notas_fiscais) ? rec.notas_fiscais : []
        const nfsAtivas = nfsJoin.filter(
          (n: any) => n.status === 'aprovada' || n.status === 'aguardando_aprovacao',
        )
        if (nfsAtivas.length > 0) {
          if (rec.status_documento === 'pendente_nf') {
            rec.status_documento = 'nf_recebida'
          }
          if (!rec.nf_numero) {
            const nf = nfsAtivas.find((n: any) => n.status === 'aprovada') ?? nfsAtivas[0]
            rec.nf_numero = nf.numero_nf ?? null
            rec.nf_data   = nf.data_emissao ?? null
            if (!rec.nf_pdf_url && nf.arquivo_url) rec.nf_pdf_url = nf.arquivo_url
          }
        }

        // nf_count: total de NFs ativas — usado pela UI para mostrar badge "+N"
        // quando há mais de uma NF no pedido.
        rec.nf_count = nfsAtivas.length > 0
          ? nfsAtivas.length
          : (rec.nf_numero ? 1 : 0)

        // nf_pdfs: lista de todas as NFs com PDF para o dropdown multi-NF
        rec.nf_pdfs = nfsAtivas
          .filter((n: any) => n.arquivo_url)
          .map((n: any) => ({ numero_nf: n.numero_nf, url: n.arquivo_url }))
        // Inclui o nf_pdf_url legacy se não está coberto acima
        if (rec.nf_pdf_url && !rec.nf_pdfs.some((p: any) => p.url === rec.nf_pdf_url)) {
          rec.nf_pdfs.unshift({ numero_nf: rec.nf_numero ?? 'NF', url: rec.nf_pdf_url })
        }

        delete rec.notas_fiscais
        return rec
      })

    // Filtro view=com-nf aplicado em código (após derivação do status_documento).
    // Se estamos no fallback sem doc cols não filtramos — melhor mostrar tudo
    // do que deixar a página vazia.
    const resultado = (view === 'com-nf' && temDocCols)
      ? ativos.filter((d: any) => d.status_documento === 'nf_recebida' || d.status_documento === 'pago')
      : ativos

    return NextResponse.json(resultado)
  } catch (e: any) {
    return apiError(e)
  }
}
