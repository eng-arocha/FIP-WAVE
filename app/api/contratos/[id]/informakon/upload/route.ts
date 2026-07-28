import { NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/api/rate-limit'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { parseRelatorio } from '@/lib/informakon/parser'
import * as XLSX from 'xlsx'

/**
 * POST /api/contratos/[id]/informakon/upload
 * multipart/form-data: file=<xlsx "Controle FIP INFORMAKON" exportado do ERP>
 *
 * Lê todas as abas do arquivo como array-of-arrays (o parser é quem sabe
 * localizar o cabeçalho de cada uma, que muda de linha e de nome conforme a
 * versão do relatório) e delega a interpretação para `parseRelatorio`.
 * Grava o resultado nas 4 tabelas da migration 075 — um retrato datado da
 * importação, nunca uma sobrescrita do que já existe.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Tabelas da migration 075 — usadas tanto pro insert quanto pro diagnóstico
// de "migration ainda não rodou" (ver isSchemaMissingError).
const TABELAS_075 = [
  'informakon_importacoes',
  'informakon_nf_linhas',
  'informakon_medicao_descontos',
  'informakon_medicoes_servico',
]

const MESES_PT: Record<string, string> = {
  JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
  JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
}

/**
 * Extrai a data de referência do nome do arquivo no padrão `DDMMMAA`
 * (ex.: "Controle_FIP_INFORMAKON_28JUL26.xlsx" -> "2026-07-28").
 *
 * O relatório não traz essa data em nenhuma célula — só no nome do arquivo,
 * que o time da FIP preenche à mão. Por isso é best-effort: se não casar o
 * padrão, devolve null e quem chama simplesmente omite o campo (a coluna
 * `referencia` tem DEFAULT CURRENT_DATE).
 */
export function extrairReferenciaDoNome(nomeArquivo: string): string | null {
  const m = String(nomeArquivo ?? '').toUpperCase().match(
    /(\d{2})(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(\d{2})/,
  )
  if (!m) return null
  const [, dd, mes, aa] = m
  const dia = Number(dd)
  const ano = 2000 + Number(aa)
  if (dia < 1 || dia > 31) return null
  const mm = MESES_PT[mes]
  // Validação simples de calendário — evita "31FEV26" virar data inválida.
  const data = new Date(Date.UTC(ano, Number(mm) - 1, dia))
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== Number(mm) - 1 || data.getUTCDate() !== dia) {
    return null
  }
  return `${ano}-${mm}-${dd}`
}

/** Insere em lotes de 500 — as abas grandes (NFS WAVE GLOBAL) têm milhares de linhas. */
async function inserirEmLotes(admin: ReturnType<typeof createAdminClient>, tabela: string, linhas: any[]) {
  const TAMANHO_LOTE = 500
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE)
    const { error } = await admin.from(tabela).insert(lote)
    if (error) return error
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Parse de xlsx com ~10 mil linhas (aba "NFS WAVE GLOBAL") é CPU-pesado —
  // limita abuso por IP, igual ao upload de orçamento.
  const limitacao = rateLimit({ key: 'informakon-upload:' + clientIp(req), max: 10, windowMs: 10 * 60_000 })
  if (!limitacao.ok) {
    return NextResponse.json(
      { error: `Muitas requisições. Aguarde ${limitacao.retryAfterSec ?? 60}s.` },
      { status: 429 },
    )
  }
  const negado = await requirePermissao('contratos', 'editar')
  if (negado) return negado

  try {
    const { id: contratoId } = await params
    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })

    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true })
    const abas = wb.SheetNames.map(nome => ({
      nome,
      aoa: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, blankrows: false, defval: null }),
    }))

    // Erros aqui são de conteúdo do arquivo (aba/cabeçalho ausente), não do
    // servidor — 400, não 500.
    let resultado: ReturnType<typeof parseRelatorio>
    try {
      resultado = parseRelatorio(abas)
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
    }
    const { nfs, descontos, medicoesServico, fornecedoresAmbiguos, macroItensDesconhecidos, avisos, totais } = resultado

    const admin = createAdminClient()

    // Usuário logado via client user-scoped (cookies) — o admin client é
    // service-role e não carrega sessão. Se não houver user (ex.: token
    // expirado no meio da requisição), não falha a importação por isso.
    let importadoPorId: string | null = null
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      importadoPorId = user?.id ?? null
    } catch {
      importadoPorId = null
    }

    const referencia = extrairReferenciaDoNome(file.name)

    const importacaoInsert: Record<string, unknown> = {
      contrato_id: contratoId,
      arquivo_nome: file.name,
      importado_por_id: importadoPorId,
      qtd_linhas: totais.qtd_linhas,
      total_nf: totais.total_nf,
      total_descontado: totais.total_descontado,
      total_a_descontar: totais.total_a_descontar,
    }
    if (referencia) importacaoInsert.referencia = referencia

    const { data: importacao, error: impErr } = await admin
      .from('informakon_importacoes')
      .insert(importacaoInsert)
      .select('id')
      .single()

    if (impErr) {
      if (isSchemaMissingError(impErr, TABELAS_075)) {
        return NextResponse.json(
          { error: 'Funcionalidade pendente: rode a migration 075 no Supabase.', code: 'MIGRATION_PENDENTE' },
          { status: 503 },
        )
      }
      throw impErr
    }
    const importacaoId = importacao.id as string

    // A partir daqui, qualquer falha precisa desfazer a importação — senão
    // fica um retrato pela metade, pior que não ter importado nada.
    const desfazerImportacao = async () => {
      await admin.from('informakon_importacoes').delete().eq('id', importacaoId)
    }

    const nfLinhas = nfs.map(nf => ({
      importacao_id: importacaoId,
      entrada: nf.entrada,
      documento: nf.documento,
      numero_nf: nf.numero_nf,
      tipo_doc: nf.tipo_doc,
      pedido: nf.pedido,
      item_pedido: nf.item_pedido,
      macro_item: nf.macro_item,
      grupo_codigo: nf.grupo_codigo,
      detalhamento_codigo: nf.detalhamento_codigo,
      valor_descontado: nf.valor_descontado,
      valor_a_descontar: nf.valor_a_descontar,
      fornecedor_codigo: nf.fornecedor_codigo ?? null,
      fornecedor_nome: nf.fornecedor_nome ?? null,
      metodo_fornecedor: nf.metodo_fornecedor ?? null,
    }))
    const erroNf = await inserirEmLotes(admin, 'informakon_nf_linhas', nfLinhas)
    if (erroNf) {
      await desfazerImportacao()
      throw erroNf
    }

    const descontoLinhas = descontos.map(d => ({
      importacao_id: importacaoId,
      medicao_numero: d.medicao_numero,
      entrada: d.entrada,
      documento: d.documento,
      numero_nf: d.numero_nf,
      macro_item: d.macro_item,
      grupo_codigo: d.grupo_codigo,
      detalhamento_codigo: d.detalhamento_codigo,
      valor_a_descontar: d.valor_a_descontar,
      percentual_desc: d.percentual_desc,
      valor_descontado: d.valor_descontado,
      fornecedor_codigo: d.fornecedor_codigo ?? null,
      fornecedor_nome: d.fornecedor_nome ?? null,
      // Não existe metodo_fornecedor em informakon_medicao_descontos — o
      // fornecedor aqui é só herdado de informakon_nf_linhas pela `entrada`.
    }))
    const erroDesconto = await inserirEmLotes(admin, 'informakon_medicao_descontos', descontoLinhas)
    if (erroDesconto) {
      await desfazerImportacao()
      throw erroDesconto
    }

    const medicaoServicoLinhas = medicoesServico.map(m => ({
      importacao_id: importacaoId,
      numero_informakon: m.numero_informakon,
      rotulo: m.rotulo,
      medicao_numero: m.medicao_numero,
      data_medicao: m.data_medicao,
      valor_contratual: m.valor_contratual,
      valor_material: m.valor_material,
      valor_liquido: m.valor_liquido,
      valor_reajuste: m.valor_reajuste,
      descontos_diversos: m.descontos_diversos,
      impostos_retidos: m.impostos_retidos,
      retencao: m.retencao,
      valor_a_pagar: m.valor_a_pagar,
      tipo_documento: m.tipo_documento,
      numero_documento: m.numero_documento,
    }))
    const erroMedicaoServico = await inserirEmLotes(admin, 'informakon_medicoes_servico', medicaoServicoLinhas)
    if (erroMedicaoServico) {
      await desfazerImportacao()
      throw erroMedicaoServico
    }

    return NextResponse.json({
      ok: true,
      importacao_id: importacaoId,
      totais,
      avisos,
      macroItensDesconhecidos,
      fornecedoresAmbiguos,
      medicoes_servico: medicaoServicoLinhas.length,
      descontos: descontoLinhas.length,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
