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

// ── Migration 062 ────────────────────────────────────────
const SQL_062_TABELA = `
CREATE TABLE IF NOT EXISTS retencao_movimentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('credito', 'debito', 'reversao_credito', 'reversao_debito')),
  origem_tipo     TEXT NOT NULL CHECK (origem_tipo IN ('medicao_aprovada', 'nf_wave_emitida', 'ajuste_manual', 'pagamento_final', 'desfazer_aprovacao')),
  origem_id       UUID,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  saldo_apos      NUMERIC(15,2) NOT NULL,
  descricao       TEXT,
  criado_por_id   UUID REFERENCES perfis(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`
const SQL_062_IDX1 = `CREATE INDEX IF NOT EXISTS idx_retencao_movimentos_contrato_data ON retencao_movimentos(contrato_id, created_at DESC);`
const SQL_062_IDX2 = `CREATE INDEX IF NOT EXISTS idx_retencao_movimentos_origem ON retencao_movimentos(origem_tipo, origem_id);`
const SQL_062_RLS = `ALTER TABLE retencao_movimentos ENABLE ROW LEVEL SECURITY;`
const SQL_062_DROP_POLICY = `DROP POLICY IF EXISTS retencao_movimentos_select ON retencao_movimentos;`
const SQL_062_CREATE_POLICY = `CREATE POLICY retencao_movimentos_select ON retencao_movimentos FOR SELECT TO authenticated USING (true);`
const SQL_062_FUNCTION = `
CREATE OR REPLACE FUNCTION aplicar_movimento_retencao(
  p_contrato_id   UUID,
  p_tipo          TEXT,
  p_origem_tipo   TEXT,
  p_origem_id     UUID,
  p_valor         NUMERIC,
  p_descricao     TEXT,
  p_criado_por    UUID
) RETURNS TABLE(movimento_id UUID, saldo_apos NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_saldo_atual NUMERIC;
  v_saldo_novo  NUMERIC;
  v_id          UUID;
BEGIN
  PERFORM 1 FROM contratos WHERE id = p_contrato_id FOR UPDATE;
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('credito', 'reversao_debito') THEN valor
      WHEN tipo IN ('debito', 'reversao_credito') THEN -valor
      ELSE 0
    END
  ), 0) INTO v_saldo_atual
  FROM retencao_movimentos
  WHERE contrato_id = p_contrato_id;
  IF p_tipo IN ('credito', 'reversao_debito') THEN
    v_saldo_novo := v_saldo_atual + p_valor;
  ELSIF p_tipo IN ('debito', 'reversao_credito') THEN
    IF p_valor > v_saldo_atual + 0.01 THEN
      RAISE EXCEPTION 'Tentativa de débito de R$ % com saldo atual R$ %', p_valor, v_saldo_atual;
    END IF;
    v_saldo_novo := v_saldo_atual - p_valor;
  ELSE
    RAISE EXCEPTION 'Tipo de movimento desconhecido: %', p_tipo;
  END IF;
  INSERT INTO retencao_movimentos
    (contrato_id, tipo, origem_tipo, origem_id, valor, saldo_apos, descricao, criado_por_id)
  VALUES
    (p_contrato_id, p_tipo, p_origem_tipo, p_origem_id, p_valor, v_saldo_novo, p_descricao, p_criado_por)
  RETURNING id INTO v_id;
  movimento_id := v_id;
  saldo_apos   := v_saldo_novo;
  RETURN NEXT;
END;
$func$;
`
const SQL_062_REVOKE_FUNC = `REVOKE ALL ON FUNCTION aplicar_movimento_retencao(UUID, TEXT, TEXT, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;`
const SQL_062_GRANT_FUNC = `GRANT EXECUTE ON FUNCTION aplicar_movimento_retencao(UUID, TEXT, TEXT, UUID, NUMERIC, TEXT, UUID) TO service_role;`

// ── Migration 064 ────────────────────────────────────────
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
// VALOR_AJUSTE 58.69 inline na lista de movimentos

async function tryExec(admin: ReturnType<typeof createAdminClient>, sql: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    const { error } = await admin.rpc('exec_sql', { p_sql: sql })
    if (error) return { ok: false, erro: error.message }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, erro: e?.message ?? String(e) }
  }
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

    // 1a. Migration 062 — tabela retencao_movimentos + RPC aplicar_movimento_retencao
    passos.push({ passo: '062_tabela', ...(await tryExec(admin, SQL_062_TABELA)) })
    passos.push({ passo: '062_idx1', ...(await tryExec(admin, SQL_062_IDX1)) })
    passos.push({ passo: '062_idx2', ...(await tryExec(admin, SQL_062_IDX2)) })
    passos.push({ passo: '062_rls', ...(await tryExec(admin, SQL_062_RLS)) })
    passos.push({ passo: '062_drop_policy', ...(await tryExec(admin, SQL_062_DROP_POLICY)) })
    passos.push({ passo: '062_create_policy', ...(await tryExec(admin, SQL_062_CREATE_POLICY)) })
    passos.push({ passo: '062_function', ...(await tryExec(admin, SQL_062_FUNCTION)) })
    passos.push({ passo: '062_revoke_func', ...(await tryExec(admin, SQL_062_REVOKE_FUNC)) })
    passos.push({ passo: '062_grant_func', ...(await tryExec(admin, SQL_062_GRANT_FUNC)) })

    // 1b. Migration 064 — RPCs pra dashboard
    passos.push({ passo: 'rpc_dashboard_summary', ...(await tryExec(admin, SQL_RPC_DASHBOARD_SUMMARY)) })
    passos.push({ passo: 'rpc_saldo_contrato', ...(await tryExec(admin, SQL_RPC_SALDO_CONTRATO)) })

    // 2. Grants/Revokes (idempotente)
    const grants = [
      SQL_GRANTS_DASHBOARD, SQL_GRANTS_DASHBOARD_2, SQL_GRANTS_DASHBOARD_3,
      SQL_GRANTS_DASHBOARD_4, SQL_GRANTS_SALDO, SQL_GRANTS_SALDO_2,
    ]
    for (const [idx, s] of grants.entries()) {
      passos.push({ passo: `grant_${idx}`, ...(await tryExec(admin, s)) })
    }

    // 3. NOTIFY pgrst reload schema
    passos.push({ passo: 'notify_pgrst', ...(await tryExec(admin, SQL_NOTIFY_RELOAD)) })

    // 4. Aplica movimentos da MED-001 retroativamente (livro-razão estava
    // vazio porque migration 062 nao havia sido aplicada). 3 movimentos:
    //
    //   (a) crédito R$ 16.887,41 — corresponde à retenção descontada na
    //       NF Wave R$ 122.377,44 (= bruto 139.264,86 − 16.887,41)
    //   (b) débito  R$ 16.887,41 — abate o crédito acima (NF Wave já saiu)
    //   (c) crédito R$ 58,69     — ajuste alinhamento fórmula nova
    //
    // Total creditado = R$ 16.946,10 (mostra no card 'Retenção Contratual')
    // Saldo final = R$ 58,69 positivo (abate na MED-002)
    //
    // Idempotência: checa saldo atual via RPC. Se já = 58,69 (= retroativo
    // já aplicado) ou se total_creditos via summary já = 16.946,10, pula.
    let saldoAtual = -1
    let totalCreditadoAtual = -1
    try {
      const { data: sd } = await admin.rpc('retencao_saldo_contrato', { p_contrato_id: CONTRATO_ID }).single()
      saldoAtual = Number(sd ?? -1)
    } catch {/* silencioso */}
    try {
      const { data: rs } = await admin.rpc('retencao_dashboard_summary').single()
      totalCreditadoAtual = Number((rs as any)?.total_creditos ?? -1)
    } catch {/* silencioso */}

    const movimentos = [
      {
        nome: 'credito_med001',
        valor: 16887.41,
        params: {
          p_contrato_id: CONTRATO_ID,
          p_tipo: 'credito',
          p_origem_tipo: 'medicao_aprovada',
          p_origem_id: MEDICAO_ID,
          p_valor: 16887.41,
          p_descricao: 'Retenção 5% × (wave + mat - retido) da MED-001 (cálculo aplicado na aprovação original em 04/05/2026, fórmula antiga base R$ 337.748,27).',
          p_criado_por: null,
        },
      },
      {
        nome: 'debito_med001',
        valor: 16887.41,
        params: {
          p_contrato_id: CONTRATO_ID,
          p_tipo: 'debito',
          p_origem_tipo: 'nf_wave_emitida',
          p_origem_id: MEDICAO_ID,
          p_valor: 16887.41,
          p_descricao: 'Desconto na NF Wave R$ 122.377,44 da MED-001: NF bruta R$ 139.264,86 − retenção R$ 16.887,41.',
          p_criado_por: null,
        },
      },
      {
        nome: 'ajuste_58.69',
        valor: 58.69,
        params: {
          p_contrato_id: CONTRATO_ID,
          p_tipo: 'credito',
          p_origem_tipo: 'ajuste_manual',
          p_origem_id: MEDICAO_ID,
          p_valor: 58.69,
          p_descricao: 'Ajuste alinhamento com nova fórmula de retenção (spec 2026-05-06): base = mat_medido + serv_medido. Diferença vs cálculo aplicado na MED-001 (5% × R$ 1.173,80 do material retido).',
          p_criado_por: null,
        },
      },
    ]

    if (totalCreditadoAtual >= 16946.10 - 0.01) {
      passos.push({ passo: 'movimentos_med001', ja_aplicado: true, saldo: saldoAtual, total_creditado: totalCreditadoAtual })
    } else {
      for (const mv of movimentos) {
        const { data: ajData, error: ajErr } = await admin.rpc('aplicar_movimento_retencao', mv.params)
        if (ajErr) {
          passos.push({ passo: `mov_${mv.nome}`, ok: false, erro: ajErr.message, code: (ajErr as any).code })
        } else {
          passos.push({ passo: `mov_${mv.nome}`, ok: true, dado: ajData })
        }
      }
    }

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
