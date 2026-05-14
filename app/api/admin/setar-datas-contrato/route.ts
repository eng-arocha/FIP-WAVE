import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/admin/setar-datas-contrato
 *
 * One-shot pra setar data_inicio + data_fim do contrato
 * aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa em 2026-04-01 → 2027-10-31
 * (janela da repactuação — "cronograma zero" pedido pelo usuário em
 * 2026-05-06).
 *
 * Sem isso a planilha física saía com 0 colunas de mês porque o gerador
 * usa essa janela pra montar Apr-26, Mai-26, … Out-27.
 */
async function executar(): Promise<Response> {
  try {
    const admin = createAdminClient()
    const CONTRATO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const DATA_INICIO = '2026-04-01'
    const DATA_FIM    = '2027-10-31'

    const { data: antes, error: errAntes } = await admin
      .from('contratos')
      .select('id, numero_contrato, data_inicio, data_fim')
      .eq('id', CONTRATO_ID)
      .single()
    if (errAntes) throw errAntes

    const { error: upErr } = await admin
      .from('contratos')
      .update({ data_inicio: DATA_INICIO, data_fim: DATA_FIM })
      .eq('id', CONTRATO_ID)
    if (upErr) throw upErr

    const { data: depois } = await admin
      .from('contratos')
      .select('id, numero_contrato, data_inicio, data_fim')
      .eq('id', CONTRATO_ID)
      .single()

    // Conta meses pra confirmar que a janela bate (abr/26 → out/27 = 19)
    const start = new Date(DATA_INICIO)
    const end = new Date(DATA_FIM)
    let n = 0
    const cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) { n++; cur.setMonth(cur.getMonth() + 1) }

    return NextResponse.json({
      ok: true,
      antes,
      depois,
      meses_no_cronograma: n,
      mensagem: `Datas atualizadas. A planilha agora vem com ${n} colunas de mês (${DATA_INICIO} → ${DATA_FIM}).`,
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function GET() { return executar() }
export async function POST() { return executar() }
