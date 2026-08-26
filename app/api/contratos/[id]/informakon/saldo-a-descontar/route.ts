import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { parseSaldoColado } from '@/lib/informakon/saldo-colado'
import { rechavearRetrato } from '@/lib/informakon/rechavear'
import { carregarAlocacaoDeNotas } from '@/lib/db/alocacao-notas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /api/contratos/[id]/informakon/saldo-a-descontar
 *
 * Retrato datado do saldo a descontar do Informakon (migrations 080 e 081).
 * Serve de TETO DE REALIDADE: o boletim avisa quando manda descontar mais do
 * que existe lançado no ERP.
 *
 * POST — body { texto, referencia?, observacoes? }. O texto é a colagem crua;
 *        `lib/informakon/saldo-colado.ts` reconhece dois layouts: a grade do
 *        ERP NOTA A NOTA (preferido — permite dizer QUAL nota falta lançar) e
 *        a tabela dinâmica somada por macro item. O de-para do macro item usa
 *        as MESMAS funções da importação do xlsx.
 * GET  — devolve o retrato mais recente do contrato, com as notas quando o
 *        layout colado as trouxe.
 *
 * Permissão: `medicoes.visualizar` no GET, `medicoes.editar` no POST — quem
 * informa o saldo está alimentando uma trava de conferência financeira.
 */

const TABELAS_080 = ['informakon_saldo_snapshots', 'informakon_saldo_linhas']
/**
 * Colunas e tabela da 081. Enquanto ela não roda, o retrato continua sendo
 * gravado no formato da 080 — só perde o detalhe por nota.
 */
const SCHEMA_081 = [
  'informakon_saldo_notas',
  'formato',
  'total_descontado',
  'total_descontado_informado',
  'valor_descontado',
]

/** Linha crua do PostgREST — as colunas variam com a migration aplicada. */
type Registro = Record<string, unknown>

const Body = z.object({
  texto: z.string().min(1, 'Cole a tabela do Informakon.').max(400_000),
  /** ISO YYYY-MM-DD. Ausente = hoje. */
  referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  observacoes: z.string().max(2000).optional(),
})

function migrationPendente() {
  return NextResponse.json(
    {
      error: 'Funcionalidade pendente: rode a migration 080 no Supabase.',
      code: 'MIGRATION_PENDENTE',
    },
    { status: 503 },
  )
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { texto, referencia, observacoes } = parsed.data

    const lido = parseSaldoColado(texto)
    if (lido.linhas.length === 0) {
      return NextResponse.json(
        {
          error: 'Nenhuma linha reconhecida. Cole a grade do ERP (Documento / Especificação / Vlr. a Desc) ou a tabela somada por macro item ("Faturamento direto - ESGOTO⇥413.942,67").',
          code: 'COLAGEM_VAZIA',
          ignoradas: lido.ignoradas.slice(0, 10),
        },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const base = {
      contrato_id: contratoId,
      referencia: referencia ?? new Date().toISOString().slice(0, 10),
      informado_por_id: user?.id ?? null,
      total: lido.total,
      total_informado: lido.totalInformado,
      observacoes: observacoes ?? null,
    }

    // A 081 pode não ter rodado ainda. Tenta com as colunas novas e, se o
    // schema não as conhece, grava o retrato no formato da 080 — melhor um
    // retrato sem detalhe do que nenhum.
    let temSchema081 = true
    let snapRes = await admin
      .from('informakon_saldo_snapshots')
      .insert({
        ...base,
        formato: lido.formato,
        total_descontado: lido.totalDescontado,
        total_descontado_informado: lido.totalDescontadoInformado,
      })
      .select('id')
      .single()
    if (snapRes.error && isSchemaMissingError(snapRes.error, SCHEMA_081)) {
      temSchema081 = false
      snapRes = await admin
        .from('informakon_saldo_snapshots')
        .insert(base)
        .select('id')
        .single()
    }
    if (snapRes.error) {
      if (isSchemaMissingError(snapRes.error, TABELAS_080)) return migrationPendente()
      throw snapRes.error
    }

    const snapshotId = (snapRes.data as any).id as string
    /** Desfaz tudo: snapshot sem linha mascararia o retrato anterior, que é bom. */
    const desfazer = () => admin.from('informakon_saldo_snapshots').delete().eq('id', snapshotId)

    const linhasBase = lido.linhas.map(l => ({
      snapshot_id: snapshotId,
      macro_item: l.macroItem,
      grupo_codigo: l.grupoCodigo,
      detalhamento_codigo: l.detalhamentoCodigo,
      valor: l.valor,
    }))
    let linhasErr = temSchema081
      ? (await admin.from('informakon_saldo_linhas').insert(
          linhasBase.map((l, i) => ({ ...l, valor_descontado: lido.linhas[i].valorDescontado })),
        )).error
      : (await admin.from('informakon_saldo_linhas').insert(linhasBase)).error
    if (linhasErr && temSchema081 && isSchemaMissingError(linhasErr, SCHEMA_081)) {
      temSchema081 = false
      linhasErr = (await admin.from('informakon_saldo_linhas').insert(linhasBase)).error
    }
    if (linhasErr) {
      await desfazer()
      if (isSchemaMissingError(linhasErr, TABELAS_080)) return migrationPendente()
      throw linhasErr
    }

    // Detalhe por nota — o que permite dizer QUAL nota falta lançar. Só existe
    // no layout detalhado, e some sem quebrar nada se a 081 estiver pendente.
    let notasSalvas = 0
    if (lido.notas.length > 0 && temSchema081) {
      const { error: notasErr } = await admin
        .from('informakon_saldo_notas')
        .insert(lido.notas.map(n => ({
          snapshot_id: snapshotId,
          documento: n.documento,
          tipo_doc: n.tipoDoc,
          numero_nf: n.numeroNf,
          insumo: n.insumo,
          macro_item: n.macroItem,
          grupo_codigo: n.grupoCodigo,
          detalhamento_codigo: n.detalhamentoCodigo,
          valor_a_descontar: n.valorADescontar,
          valor_descontado: n.valorDescontado,
        })))
      if (notasErr) {
        if (!isSchemaMissingError(notasErr, SCHEMA_081)) {
          await desfazer()
          throw notasErr
        }
        temSchema081 = false
      } else {
        notasSalvas = lido.notas.length
      }
    }

    const somaConfere = lido.totalInformado === null
      || Math.abs(lido.total - lido.totalInformado) < 0.01

    return NextResponse.json({
      ok: true,
      snapshot_id: snapshotId,
      formato: lido.formato,
      qtd_linhas: lido.linhas.length,
      qtd_notas: notasSalvas,
      /** true = colou nota a nota mas a migration 081 ainda não rodou. */
      detalhe_descartado: lido.notas.length > 0 && notasSalvas === 0,
      total: lido.total,
      total_informado: lido.totalInformado,
      total_descontado: lido.totalDescontado,
      /** false = a soma das linhas não bate com o "Total Geral" colado. */
      soma_confere: somaConfere,
      nao_reconhecidas: lido.naoReconhecidas.map(l => l.macroItem),
      ignoradas: lido.ignoradas.slice(0, 10),
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const negado = await requirePermissao('medicoes', 'visualizar')
  if (negado) return negado
  try {
    const { id: contratoId } = await params
    const admin = createAdminClient()

    const COLS_080 = 'id, referencia, informado_em, total, total_informado, observacoes'
    const buscarSnap = (cols: string) => admin
      .from('informakon_saldo_snapshots')
      .select(cols)
      .eq('contrato_id', contratoId)
      .order('referencia', { ascending: false })
      .order('informado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    let snapRes = await buscarSnap(`${COLS_080}, formato, total_descontado, total_descontado_informado`)
    if (snapRes.error && isSchemaMissingError(snapRes.error, SCHEMA_081)) {
      snapRes = await buscarSnap(COLS_080)
    }

    // Migration 080 pendente não é erro para quem só está abrindo o boletim:
    // devolve "sem retrato" e a UI simplesmente não mostra o painel.
    if (snapRes.error) {
      if (isSchemaMissingError(snapRes.error, TABELAS_080)) {
        return NextResponse.json({ temDados: false, motivo: 'MIGRATION_PENDENTE' })
      }
      throw snapRes.error
    }
    if (!snapRes.data) return NextResponse.json({ temDados: false })

    const snap = snapRes.data as any
    const buscarLinhas = (cols: string) => admin
      .from('informakon_saldo_linhas')
      .select(cols)
      .eq('snapshot_id', snap.id)

    let linhasRes = await buscarLinhas('macro_item, grupo_codigo, detalhamento_codigo, valor, valor_descontado')
    if (linhasRes.error && isSchemaMissingError(linhasRes.error, SCHEMA_081)) {
      linhasRes = await buscarLinhas('macro_item, grupo_codigo, detalhamento_codigo, valor')
    }
    if (linhasRes.error) throw linhasRes.error

    // Detalhe por nota: ausente em retrato agregado e enquanto a 081 não roda.
    const notasRes = await admin
      .from('informakon_saldo_notas')
      .select('documento, tipo_doc, numero_nf, macro_item, grupo_codigo, detalhamento_codigo, valor_a_descontar, valor_descontado')
      .eq('snapshot_id', snap.id)
    if (notasRes.error && !isSchemaMissingError(notasRes.error, SCHEMA_081)) throw notasRes.error
    const notasBrutas: Registro[] = notasRes.error ? [] : ((notasRes.data || []) as Registro[])

    /** Chave de comparação: grupo macro, ou o detalhamento no grupo 19. */
    const chaveDe = (l: Registro) => String(l.detalhamento_codigo || l.grupo_codigo || '')

    const rotuloPorChave = new Map<string, string>()
    for (const l of (linhasRes.data || []) as unknown as Registro[]) {
      const k = chaveDe(l)
      if (k && !rotuloPorChave.has(k)) rotuloPorChave.set(k, String(l.macro_item ?? ''))
    }

    // ── REENDEREÇAMENTO ────────────────────────────────────────────────
    //
    // O macro item do Informakon é propriedade do ITEM DO PEDIDO da FIP, não
    // da nota: a mesma nota aparece em vários macro itens lá (a NF-e 206
    // aparece em sete). Nós rateamos a mesma nota pelos detalhamentos do
    // nosso pedido. São duas classificações do mesmo material, e lançamento
    // já feito no ERP não se corrige.
    //
    // Comparar sem reendereçar acusaria "falta lançar" para nota que ESTÁ
    // lançada, só sob outro rótulo — e não haveria ação possível. Então o
    // saldo é lido no endereçamento do boletim. O total não muda: só o
    // endereço. Ver lib/informakon/rechavear.ts.
    let linhasSaida = ((linhasRes.data || []) as unknown as Registro[]).map(l => ({
      chave: chaveDe(l),
      rotulo: String(l.macro_item ?? ''),
      valor: Number(l.valor || 0),
      valorDescontado: Number(l.valor_descontado || 0),
    })).filter(l => l.chave)
    let notasSaida: Array<{
      chave: string; documento: string; tipoDoc: string | null; numeroNf: string | null
      macroItem: string; valorADescontar: number; valorDescontado: number
    }> = notasBrutas.map(n => ({
      chave: chaveDe(n),
      documento: String(n.documento ?? ''),
      tipoDoc: (n.tipo_doc as string) ?? null,
      numeroNf: (n.numero_nf as string) ?? null,
      macroItem: String(n.macro_item ?? ''),
      valorADescontar: Number(n.valor_a_descontar || 0),
      valorDescontado: Number(n.valor_descontado || 0),
    })).filter(n => n.chave)
    let totalRealocado = 0
    let realocadas: Array<{ numero: string; documento: string; deChave: string; paraChaves: string[]; valor: number }> = []

    if (notasSaida.length > 0) {
      const alocacao = await carregarAlocacaoDeNotas(admin, contratoId)
      const rech = rechavearRetrato(notasSaida, alocacao)
      linhasSaida = [...rech.porChave.entries()].map(([chave, v]) => ({
        chave,
        rotulo: rotuloPorChave.get(chave) || `Macro item ${chave}`,
        valor: v.aDescontar,
        valorDescontado: v.descontado,
      }))
      const tipoPorNumero = new Map(notasSaida.map(n => [String(n.numeroNf ?? ''), n.tipoDoc]))
      notasSaida = rech.notas.map(n => ({
        chave: n.chave,
        documento: n.documento ?? '',
        tipoDoc: tipoPorNumero.get(String(n.numeroNf ?? '')) ?? null,
        numeroNf: n.numeroNf,
        macroItem: n.macroItem ?? '',
        valorADescontar: n.valorADescontar,
        valorDescontado: n.valorDescontado,
      }))
      totalRealocado = rech.totalRealocado
      realocadas = rech.realocadas
    }

    return NextResponse.json({
      temDados: true,
      snapshot_id: snap.id,
      formato: snap.formato ?? (notasBrutas.length > 0 ? 'detalhado' : 'agregado'),
      referencia: snap.referencia,
      informado_em: snap.informado_em,
      total: Number(snap.total || 0),
      total_informado: snap.total_informado === null || snap.total_informado === undefined
        ? null : Number(snap.total_informado),
      total_descontado: Number(snap.total_descontado || 0),
      observacoes: snap.observacoes ?? null,
      linhas: linhasSaida,
      notas: notasSaida,
      /** Σ reendereçado — o total do retrato não muda, só o endereço. */
      total_realocado: totalRealocado,
      realocadas: realocadas.slice(0, 30),
    })
  } catch (e: any) {
    return apiError(e)
  }
}
