-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 086 — Valores do Informakon congelados na aprovação + "% real"
--
-- Spec: docs/superpowers/specs/2026-10-28-congelar-informakon-e-cortes.md
--
-- A aprovação passa a receber os 5 números da tela "Valores Financeiros" do
-- Informakon (contratual, material, retenção, descontos diversos, líquido) e
-- grava-os na medição. Os quatro primeiros vão nas colunas que já existem
-- (valor_total, valor_material_correspondente, valor_retencao_garantia,
-- ajuste_material_anterior); o líquido e a origem ficam aqui.
--
-- `regra_pct_real`: a medição foi lançada pelo % físico, e o material sem
-- lastro ficou como desconto pendente do item (camada ①). Medição aberta
-- sempre segue a regra; a flag diz como reimprimir uma APROVADA. MED-001 a
-- 006 ficam false (foram lançadas com o % cortado).
--
-- Idempotente. Sem ela, a aprovação grava só as colunas antigas e medição
-- aprovada é reimpressa pela regra antiga.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS regra_pct_real BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS informakon_liquido NUMERIC(15,2);
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS informakon_valores_origem TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medicoes_informakon_valores_origem_check'
  ) THEN
    ALTER TABLE medicoes ADD CONSTRAINT medicoes_informakon_valores_origem_check
      CHECK (informakon_valores_origem IS NULL OR informakon_valores_origem IN ('importado', 'digitado'));
  END IF;
END $$;

COMMENT ON COLUMN medicoes.regra_pct_real IS
  'Medição lançada pelo % físico; material sem lastro fica pendente no item (migration 086).';
COMMENT ON COLUMN medicoes.informakon_liquido IS
  'Valor Líquido da Medição na tela Valores Financeiros do Informakon, congelado na aprovação. É o valor do pedido Wave.';
COMMENT ON COLUMN medicoes.informakon_valores_origem IS
  'De onde vieram os valores congelados: importado (relatório) ou digitado.';

NOTIFY pgrst, 'reload schema';
