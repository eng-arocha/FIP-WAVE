-- ============================================================
-- 030 — Glosa em medição (P2.13)
-- ============================================================
-- Glosa = desconto que a fiscalização aplica em uma medição parcialmente
-- aprovada. Ex: empreiteira mede 100m² mas auditor reconhece só 90m² —
-- 10m² entram como "glosa" com motivo registrado.
--
-- Modelagem: 2 colunas em medicao_itens.
-- valor_efetivo (valor_medido - valor_glosa) é GENERATED, então sempre
-- consistente e indexável.
-- ============================================================

ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS valor_glosa  NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_glosa >= 0),
  ADD COLUMN IF NOT EXISTS motivo_glosa TEXT;

-- valor_efetivo: o que realmente conta pro pagamento.
-- IMPORTANTE: Postgres NÃO permite uma coluna GENERATED referenciar outra
-- GENERATED. Como valor_medido já é GENERATED (quantidade_medida *
-- valor_unitario), recalculamos valor_efetivo direto das colunas-base.
ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS valor_efetivo NUMERIC(15,2)
    GENERATED ALWAYS AS (
      (COALESCE(quantidade_medida, 0) * COALESCE(valor_unitario, 0))
      - COALESCE(valor_glosa, 0)
    ) STORED;

-- Index pra agregar rapidamente glosas por medição em relatórios
CREATE INDEX IF NOT EXISTS idx_medicao_itens_glosa
  ON medicao_itens(medicao_id)
  WHERE valor_glosa > 0;

COMMENT ON COLUMN medicao_itens.valor_glosa IS
  'Desconto aplicado pela fiscalização. valor_efetivo = valor_medido - valor_glosa.';
COMMENT ON COLUMN medicao_itens.motivo_glosa IS
  'Justificativa textual da glosa, exibida na trilha de auditoria.';
