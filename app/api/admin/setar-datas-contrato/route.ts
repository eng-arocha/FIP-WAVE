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
async function executar(req: Request): Promise<Response> {
  try {
    // Aceita 2 formas de auth:
    //  1. Sessão Supabase válida (proxy.ts já garantiu cookie) — caminho UI
    //  2. Header Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY> — caminho curl
    // Quando o middleware deixa passar via allowlist, validamos o token aqui.
    const auth = req.headers.get('authorization') ?? ''
    const token = auth.replace(/^Bearer\s+/i, '')
    const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    const hasBearer = token.length > 0
    if (hasBearer && token !== expected) {
      return NextResponse.json({ error: 'Não autorizado (Bearer inválido)' }, { status: 403 })
    }

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

export async function GET(req: Request) { return executar(req) }
export async function POST(req: Request) { return executar(req) }
