-- ============================================================
-- 051 — Retenção contratual em medições + snapshot do cálculo
-- ============================================================
-- Fórmula utilizada:
--   andamento_fisico_pct       = medicao.valor_total / contrato.valor_servicos
--   valor_financeiro_proporcional = andamento_fisico_pct × contrato.valor_total
--   valor_retencao_garantia    = valor_financeiro_proporcional × percentual_retencao
--
-- Esses 3 valores ficam congelados no momento da aprovação ("snapshot"),
-- pra que mudanças futuras no contrato não afetem retenções já calculadas.
-- ============================================================

-- 1) Percentual de retenção configurável por contrato (default 5%)
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS percentual_retencao NUMERIC(5,2) NOT NULL DEFAULT 5.00
    CHECK (percentual_retencao >= 0 AND percentual_retencao <= 100);

COMMENT ON COLUMN contratos.percentual_retencao IS
  'Percentual de retenção contratual aplicado sobre o valor financeiro proporcional de cada medição.';

-- 2) Snapshots no momento da aprovação da medição
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS andamento_fisico_pct NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS valor_financeiro_proporcional NUMERIC(15,2);
-- valor_retencao_garantia já existe (migration 038)

COMMENT ON COLUMN medicoes.andamento_fisico_pct IS
  'Snapshot %: valor_total da medição / contrato.valor_servicos × 100. Congelado na aprovação.';
COMMENT ON COLUMN medicoes.valor_financeiro_proporcional IS
  'Snapshot R$: andamento_fisico_pct × contrato.valor_total. Base do cálculo de retenção.';

-- 3) Índice ajuda dashboards/relatórios por contrato + status (defensivo)
CREATE INDEX IF NOT EXISTS idx_medicoes_contrato_status_aprov
  ON medicoes (contrato_id, status, data_aprovacao DESC)
  WHERE status = 'aprovado';
