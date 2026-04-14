-- ============================================================
-- 032 — Retenções fiscais nas notas fiscais (P2.8)
-- ============================================================
-- Modelagem das retenções típicas em NF de serviços/material no Brasil:
--   - ISS    (Imposto Sobre Serviços)
--   - INSS   (Contribuição previdenciária retida)
--   - IRRF   (Imposto de Renda retido na fonte)
--   - CSRF   (CSLL/COFINS/PIS retidos — agrupados por simplicidade)
--   - PIS    (separado quando aplicável)
--   - COFINS (separado quando aplicável)
--
-- Cada coluna é o VALOR retido (R$), não a alíquota — o cálculo da
-- alíquota é responsabilidade da contabilidade que opera a app.
-- Fica explícito no banco quanto foi retido pra cada NF, viabilizando:
--   1. Cálculo do valor líquido a pagar (valor - somatório retenções)
--   2. Geração de DARF/GPS/SEFAZ no fim do mês
--   3. Conciliação fiscal direta no export CSV
-- ============================================================

ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS retencao_iss     NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_iss >= 0),
  ADD COLUMN IF NOT EXISTS retencao_inss    NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_inss >= 0),
  ADD COLUMN IF NOT EXISTS retencao_irrf    NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_irrf >= 0),
  ADD COLUMN IF NOT EXISTS retencao_csrf    NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_csrf >= 0),
  ADD COLUMN IF NOT EXISTS retencao_pis     NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_pis >= 0),
  ADD COLUMN IF NOT EXISTS retencao_cofins  NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_cofins >= 0),
  ADD COLUMN IF NOT EXISTS retencao_outros  NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (retencao_outros >= 0);

-- valor_liquido = valor bruto - somatório das retenções
-- Útil pra contabilidade reportar valor real a pagar ao fornecedor.
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(15,2)
    GENERATED ALWAYS AS (
      COALESCE(valor, 0)
      - COALESCE(retencao_iss, 0)
      - COALESCE(retencao_inss, 0)
      - COALESCE(retencao_irrf, 0)
      - COALESCE(retencao_csrf, 0)
      - COALESCE(retencao_pis, 0)
      - COALESCE(retencao_cofins, 0)
      - COALESCE(retencao_outros, 0)
    ) STORED;

-- Index pra queries de fechamento fiscal por mês de emissão
CREATE INDEX IF NOT EXISTS idx_nf_fatd_data_emissao
  ON notas_fiscais_fat_direto(data_emissao);

COMMENT ON COLUMN notas_fiscais_fat_direto.valor_liquido IS
  'Valor líquido a pagar = valor bruto menos todas as retenções fiscais. GENERATED.';
