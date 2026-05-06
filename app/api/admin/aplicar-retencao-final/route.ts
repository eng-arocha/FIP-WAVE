import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/aplicar-retencao-final
 *
 * One-shot: aplica migration 064 (cria RPCs retencao_dashboard_summary +
 * retencao_saldo_contrato) via exec_sql + chama aplicar_movimento_retencao
 * com o ajuste de +R$ 58,69 pra MED-001 (alinhamento com formula nova
 * spec 2026-05-06).
 *
 * Cada statement vai separado pra exec_sql (que so executa um por vez).
 */

const SQL_RPC_DASHBOARD_SUMMARY = `
CREATE OR REPLACE FUNCTION public.retencao_dashboard_summary()
RETURNS TABLE (
  total_creditos NUMERIC,
  total_debitos NUMERIC,
  saldo NUMERIC,
  qtd_medicoes_com_credito BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(SUM(valor) FILTER (WHERE tipo IN ('credito', 'reversao_debito')), 0) AS total_creditos,
    COALESCE(SUM(valor) FILTER (WHERE tipo IN ('debito', 'reversao_credito')), 0) AS total_debitos,
    COALESCE(SUM(
      CASE
        WHEN tipo IN ('credito', 'reversao_debito') THEN valor
        WHEN tipo IN ('debito', 'reversao_credito') THEN -valor
        ELSE 0
      END
    ), 0) AS saldo,
    COUNT(DISTINCT origem_id) FILTER (WHERE tipo = 'credito' AND origem_tipo = 'medicao_aprovada') AS qtd_medicoes_com_credito
  FROM retencao_movimentos
$$;
`

const SQL_RPC_SALDO_CONTRATO = `
CREATE OR REPLACE FUNCTION public.retencao_saldo_contrato(p_contrato_id UUID)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('credito', 'reversao_debito') THEN valor
      WHEN tipo IN ('debito', 'reversao_credito') THEN -valor
      ELSE 0
    END
  ), 0)
  FROM retencao_movimentos
  WHERE contrato_id = p_contrato_id
$$;
`

const SQL_GRANTS_DASHBOARD = `
REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM PUBLIC;
`
const SQL_GRANTS_DASHBOARD_2 = `REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM anon;`
const SQL_GRANTS_DASHBOARD_3 = `REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM authenticated;`
const SQL_GRANTS_DASHBOARD_4 = `GRANT EXECUTE ON FUNCTION public.retencao_dashboard_summary() TO service_role;`
const SQL_GRANTS_SALDO = `REVOKE ALL ON FUNCTION public.retencao_saldo_contrato(UUID) FROM PUBLIC;`
const SQL_GRANTS_SALDO_2 = `GRANT EXECUTE ON FUNCTION public.retencao_saldo_contrato(UUID) TO service_role;`
const SQL_NOTIFY_RELOAD = `NOTIFY pgrst, 'reload schema';`

// IDs da MED-001 do contrato WAVE-2025-001
const CONTRATO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const MEDICAO_ID = 'd0b1048a-cc83-4e09-8edd-c4e6d1030312'
const VALOR_AJUSTE = 58.69

async function exec(admin: ReturnType<typeof createAdminClient>, sql: string, label: string) {
  const { error } = await admin.rpc('exec_sql', { p_sql: sql })
  if (error) throw new Error(`${label}: ${error.message}`)
}

export async function POST() {
  return executar()
}
export async function GET() {
  return executar()
}

async function executar(): Promise<Response> {
  const passos: any[] = []
  try {
    const admin = createAdminClient()

    // 1. Aplica RPCs (idempotente — CREATE OR REPLACE)
    await exec(admin, SQL_RPC_DASHBOARD_SUMMARY, 'CREATE retencao_dashboard_summary')
    passos.push({ passo: 'rpc_dashboard_summary', ok: true })

    await exec(admin, SQL_RPC_SALDO_CONTRATO, 'CREATE retencao_saldo_contrato')
    passos.push({ passo: 'rpc_saldo_contrato', ok: true })

    // 2. Grants (idempotente)
    for (const [idx, s] of [SQL_GRANTS_DASHBOARD, SQL_GRANTS_DASHBOARD_2, SQL_GRANTS_DASHBOARD_3, SQL_GRANTS_DASHBOARD_4, SQL_GRANTS_SALDO, SQL_GRANTS_SALDO_2].entries()) {
      try {
        await exec(admin, s, `grant ${idx}`)
      } catch (e: any) {
        passos.push({ passo: `grant_${idx}`, ok: false, erro: e?.message })
      }
    }
    passos.push({ passo: 'grants', ok: true })

    // 3. NOTIFY pgrst reload schema
    try {
      await exec(admin, SQL_NOTIFY_RELOAD, 'NOTIFY pgrst')
      passos.push({ passo: 'notify_pgrst', ok: true })
    } catch (e: any) {
      passos.push({ passo: 'notify_pgrst', ok: false, erro: e?.message })
    }

    // 4. Idempotência via RPC (bypassa schema cache stale do PostgREST):
    // pega saldo atual; se já está ≥ 58,69 acima do esperado da MED-001
    // antiga (R$ 0 — porque débito cancelou crédito), provavelmente já foi
    // aplicado. Caso contrário aplica.
    let saldoAntes = -1
    try {
      const { data: sd } = await admin.rpc('retencao_saldo_contrato', { p_contrato_id: CONTRATO_ID }).single()
      saldoAntes = Number(sd ?? -1)
    } catch (e: any) {
      passos.push({ passo: 'pre_check_saldo', erro: e?.message })
    }

    let ajusteResult: any
    if (saldoAntes >= VALOR_AJUSTE - 0.01) {
      ajusteResult = { ja_aplicado: true, saldo_atual: saldoAntes }
    } else {
      const { data: ajData, error: ajErr } = await admin.rpc('aplicar_movimento_retencao', {
        p_contrato_id: CONTRATO_ID,
        p_tipo: 'credito',
        p_origem_tipo: 'ajuste_manual',
        p_origem_id: MEDICAO_ID,
        p_valor: VALOR_AJUSTE,
        p_descricao: 'Ajuste alinhamento com nova fórmula de retenção (spec 2026-05-06): base = mat_medido + serv_medido. Diferença vs cálculo aplicado na MED-001 (5% × R$ 1.173,80 do material retido).',
        p_criado_por: null,
      })
      if (ajErr) {
        ajusteResult = { ok: false, erro: ajErr.message, code: (ajErr as any).code }
      } else {
        ajusteResult = { ok: true, dado: ajData, saldo_antes: saldoAntes }
      }
    }
    passos.push({ passo: 'ajuste_58.69', resultado: ajusteResult })

    // 5. Resumo final via RPC
    let resumoFinal: any = null
    try {
      const { data: resumo } = await admin.rpc('retencao_dashboard_summary').single()
      resumoFinal = resumo
    } catch {/* RPC pode demorar pra cache refresh */}

    return NextResponse.json({
      ok: true,
      passos,
      resumo_final: resumoFinal,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
