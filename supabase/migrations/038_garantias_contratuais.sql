-- ============================================================
-- 038 — Garantias contratuais (P2.12)
-- ============================================================
-- Tipos típicos em obra (especialmente pública):
--   1. Caução em dinheiro (5% do valor do contrato, comum em LRF)
--   2. Seguro garantia de execução (apólice com valor segurado)
--   3. Carta de fiança bancária
--   4. Retenção contratual sobre cada medição (5-10%)
--
-- Modelagem:
--   - garantias_contratuais: cada garantia individual com vencimento
--   - retencoes_medicao: percentual aplicado por medição (calculado)
-- ============================================================

CREATE TABLE IF NOT EXISTS garantias_contratuais (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id       UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN (
    'caucao_dinheiro', 'seguro_garantia', 'fianca_bancaria', 'retencao_medicao'
  )),
  valor             NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  -- Para retencao_medicao: percentual aplicado (5-10% típico)
  percentual        NUMERIC(5,2) CHECK (percentual IS NULL OR (percentual >= 0 AND percentual <= 100)),
  -- Documento de referência (apólice, número da carta, etc.)
  numero_documento  TEXT,
  emissor           TEXT,    -- seguradora ou banco
  data_emissao      DATE,
  data_vencimento   DATE,
  data_liberacao    DATE,    -- quando a garantia foi devolvida ao contratado
  url_documento     TEXT,    -- link pro PDF da apólice/carta
  observacoes       TEXT,
  ativa             BOOLEAN NOT NULL DEFAULT true,
  criado_por        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garantias_contrato
  ON garantias_contratuais(contrato_id, ativa, data_vencimento);
CREATE INDEX IF NOT EXISTS idx_garantias_vencendo
  ON garantias_contratuais(data_vencimento)
  WHERE ativa = true AND data_liberacao IS NULL;

-- Coluna em medicoes pra registrar quanto foi retido como garantia
-- (separado das retenções fiscais — esta é contratual, devolvida no fim)
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS valor_retencao_garantia NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_retencao_garantia >= 0);

-- RLS: read pra autenticados, write pra admin/aprovador
ALTER TABLE garantias_contratuais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS garantias_select ON garantias_contratuais;
CREATE POLICY garantias_select ON garantias_contratuais
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS garantias_admin ON garantias_contratuais;
CREATE POLICY garantias_admin ON garantias_contratuais
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

COMMENT ON TABLE garantias_contratuais IS
  'Garantias do contrato (caução, seguro, fiança, retenção). Crítico em obra pública.';
COMMENT ON COLUMN medicoes.valor_retencao_garantia IS
  'Valor RETIDO desta medição como garantia contratual. Devolvido ao final do contrato.';
