-- Migration 064 — RPC pra dashboard ler retenção sem depender do PostgREST
-- schema cache da tabela retencao_movimentos.
--
-- Contexto: a tabela foi criada na migration 062 mas o PostgREST schema
-- cache do projeto ficou stale e NOTIFY pgrst, 'reload schema' não está
-- ressuscitando. Como workaround, criamos RPCs com SECURITY DEFINER que
-- consultam a tabela via SQL direto — RPCs têm schema cache separado e
-- são reconhecidas assim que criadas.

-- Resumo agregado (uso no dashboard global)
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

REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM anon;
REVOKE ALL ON FUNCTION public.retencao_dashboard_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.retencao_dashboard_summary() TO service_role;

COMMENT ON FUNCTION public.retencao_dashboard_summary() IS
  'Resumo agregado de retencao_movimentos pra card do dashboard. Retorna total creditos/debitos, saldo do livro-razao e qtd de medicoes que geraram credito. Bypassa schema cache stale do PostgREST.';

-- Saldo por contrato (uso na página /contratos/[id]/retencao)
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

REVOKE ALL ON FUNCTION public.retencao_saldo_contrato(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retencao_saldo_contrato(UUID) TO service_role;
