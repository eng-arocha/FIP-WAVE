import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { parseSaldoColado } from '@/lib/informakon/saldo-colado'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /api/contratos/[id]/informakon/saldo-a-descontar
 *
 * Retrato datado do "Vlr. a Desc" por macro item, colado da tabela dinâmica
 * do Informakon (migration 080). Serve de TETO DE REALIDADE: o boletim avisa
 * quando manda descontar mais do que existe lançado no ERP.
 *
 * POST — body { texto, referencia?, observacoes? }. O texto é a colagem crua;
 *        `lib/informakon/saldo-colado.ts` faz o parse e o de-para do macro
 *        item, com as MESMAS funções da importação do xlsx.
 * GET  — devolve o retrato mais recente do contrato.
 *
 * Permissão: `medicoes.visualizar` no GET, `medicoes.editar` no POST — quem
 * informa o saldo está alimentando uma trava de conferência financeira.
 */

const TABELAS_080 = ['informakon_saldo_snapshots', 'informakon_saldo_linhas']

const Body = z.object({
  texto: z.string().min(1, 'Cole a tabela do Informakon.').max(200_000),
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
          error: 'Nenhuma linha reconhecida. Cole a tabela com o rótulo e o valor em cada linha (ex.: "Faturamento direto - ESGOTO⇥413.942,67").',
          code: 'COLAGEM_VAZIA',
          ignoradas: lido.ignoradas.slice(0, 10),
        },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const { data: snap, error: snapErr } = await admin
      .from('informakon_saldo_snapshots')
      .insert({
        contrato_id: contratoId,
        referencia: referencia ?? new Date().toISOString().slice(0, 10),
        informado_por_id: user?.id ?? null,
        total: lido.total,
        total_informado: lido.totalInformado,
        observacoes: observacoes ?? null,
      })
      .select('id')
      .single()
    if (snapErr) {
      if (isSchemaMissingError(snapErr, TABELAS_080)) return migrationPendente()
      throw snapErr
    }

    const snapshotId = (snap as any).id as string
    const { error: linhasErr } = await admin
      .from('informakon_saldo_linhas')
      .insert(lido.linhas.map(l => ({
        snapshot_id: snapshotId,
        macro_item: l.macroItem,
        grupo_codigo: l.grupoCodigo,
        detalhamento_codigo: l.detalhamentoCodigo,
        valor: l.valor,
      })))
    if (linhasErr) {
      // Snapshot sem linhas não serve pra nada e ainda mascararia o retrato
      // anterior, que é bom — remove antes de devolver o erro.
      await admin.from('informakon_saldo_snapshots').delete().eq('id', snapshotId)
      if (isSchemaMissingError(linhasErr, TABELAS_080)) return migrationPendente()
      throw linhasErr
    }

    const somaConfere = lido.totalInformado === null
      || Math.abs(lido.total - lido.totalInformado) < 0.01

    return NextResponse.json({
      ok: true,
      snapshot_id: snapshotId,
      qtd_linhas: lido.linhas.length,
      total: lido.total,
      total_informado: lido.totalInformado,
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

    const snapRes = await admin
      .from('informakon_saldo_snapshots')
      .select('id, referencia, informado_em, total, total_informado, observacoes')
      .eq('contrato_id', contratoId)
      .order('referencia', { ascending: false })
      .order('informado_em', { ascending: false })
      .limit(1)
      .maybeSingle()

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
    const { data: linhas, error: linhasErr } = await admin
      .from('informakon_saldo_linhas')
      .select('macro_item, grupo_codigo, detalhamento_codigo, valor')
      .eq('snapshot_id', snap.id)
    if (linhasErr) throw linhasErr

    return NextResponse.json({
      temDados: true,
      snapshot_id: snap.id,
      referencia: snap.referencia,
      informado_em: snap.informado_em,
      total: Number(snap.total || 0),
      total_informado: snap.total_informado === null ? null : Number(snap.total_informado),
      observacoes: snap.observacoes ?? null,
      linhas: (linhas || []).map((l: any) => ({
        // Chave de comparação: grupo macro, ou o detalhamento no grupo 19.
        chave: l.detalhamento_codigo || l.grupo_codigo || '',
        rotulo: l.macro_item,
        valor: Number(l.valor || 0),
      })).filter((l: any) => l.chave),
    })
  } catch (e: any) {
    return apiError(e)
  }
}
