import { NextResponse } from 'next/server'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { compararNotas, gerarCsvDivergencias } from '@/lib/informakon/divergencias'

/**
 * GET /api/contratos/[id]/informakon/divergencias
 *
 * Exporta em CSV as notas fiscais que divergem entre o relatório do
 * Informakon (ERP da FIP, tabelas da migration 075) e o que o FIP-WAVE tem
 * lançado em `notas_fiscais_fat_direto` — notas que só existem de um lado ou
 * com valor diferente. Hoje essa comparação só era visível rodando SQL na
 * mão; este endpoint deixa o usuário mandar a lista pra FIP resolver sem
 * depender de alguém investigar pra ele.
 *
 * Usa sempre a importação mais recente do contrato (mesma referência que a
 * tela `/contratos/[id]/informakon` mostra).
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Tabelas da migration 075 — usadas pro diagnóstico de "migration pendente".
const TABELAS_075 = ['informakon_importacoes', 'informakon_nf_linhas']

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requirePermissao('contratos', 'visualizar')
  if (negado) return negado

  try {
    const { id: contratoId } = await params
    const admin = createAdminClient()

    const { data: importacao, error: impErr } = await admin
      .from('informakon_importacoes')
      .select('id, referencia')
      .eq('contrato_id', contratoId)
      .order('referencia', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (impErr) {
      if (isSchemaMissingError(impErr, TABELAS_075)) {
        return NextResponse.json(
          { error: 'Funcionalidade pendente: rode a migration 075 no Supabase.', code: 'MIGRATION_PENDENTE' },
          { status: 503 },
        )
      }
      throw impErr
    }

    if (!importacao) {
      return NextResponse.json(
        { error: 'Nenhum relatório do Informakon importado para este contrato.' },
        { status: 404 },
      )
    }

    const { data: nfLinhas, error: nfErr } = await admin
      .from('informakon_nf_linhas')
      .select('numero_nf, tipo_doc, fornecedor_nome, grupo_codigo, detalhamento_codigo, valor_descontado, valor_a_descontar')
      .eq('importacao_id', importacao.id)
    if (nfErr) {
      if (isSchemaMissingError(nfErr, TABELAS_075)) {
        return NextResponse.json(
          { error: 'Funcionalidade pendente: rode a migration 075 no Supabase.', code: 'MIGRATION_PENDENTE' },
          { status: 503 },
        )
      }
      throw nfErr
    }

    // Notas do sistema: solicitações aprovadas e ativas do contrato, exceto
    // NF de serviço da própria Wave (mesma regra do boletim — ver migration
    // 074). `!inner` filtra pela FK pra poder aplicar as condições da
    // solicitação direto na query.
    const { data: nfsSistemaRaw, error: sistemaErr } = await admin
      .from('notas_fiscais_fat_direto')
      .select('numero_nf, emitente, valor, solicitacao:solicitacoes_fat_direto!inner(contrato_id, status, deletado_em, tipo)')
      .eq('solicitacao.contrato_id', contratoId)
      .eq('solicitacao.status', 'aprovado')
      .is('solicitacao.deletado_em', null)
    if (sistemaErr) throw sistemaErr

    const nfsSistema = (nfsSistemaRaw || [])
      .filter((nf: any) => (nf.solicitacao?.tipo ?? 'material_fornecedor') !== 'wave_servico')
      .map((nf: any) => ({
        numero_nf: nf.numero_nf as string,
        emitente: nf.emitente as string | null,
        valor: Number(nf.valor || 0),
      }))

    const divergencias = compararNotas(nfLinhas || [], nfsSistema)
    const csv = gerarCsvDivergencias(divergencias)

    const referencia = importacao.referencia as string
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="divergencias-nf-${referencia}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
