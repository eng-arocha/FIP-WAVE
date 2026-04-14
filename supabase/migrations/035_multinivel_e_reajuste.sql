-- ============================================================
-- 035 — Aprovação multinível (P2.5) + Reajuste contratual (P2.11)
-- ============================================================

-- ── PARTE 1: APROVAÇÃO MULTINÍVEL ──────────────────────────────────
-- Hoje a tabela aprovacoes já tem campo `nivel`, mas a UI/lógica não
-- exigem N níveis sequenciais. Adicionamos:
--   - Tabela fluxo_aprovacao_contrato: define a sequência de níveis
--     que cada contrato exige (ex: contrato A precisa Eng → Coord;
--     contrato B precisa só Coord).
--   - Coluna current_aprovacao_nivel em medições para rastrear progresso.

CREATE TABLE IF NOT EXISTS fluxo_aprovacao_contrato (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nivel           INT  NOT NULL CHECK (nivel BETWEEN 1 AND 5),
  papel           TEXT NOT NULL,        -- ex: 'engenheiro_fiscal', 'coordenador', 'cliente_final'
  perfil_required TEXT,                  -- perfil em perfis.perfil que satisfaz; NULL = qualquer aprovador
  obrigatorio     BOOLEAN NOT NULL DEFAULT true,
  ordem           INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contrato_id, nivel)
);

CREATE INDEX IF NOT EXISTS idx_fluxo_aprov_contrato
  ON fluxo_aprovacao_contrato(contrato_id, ordem);

-- Coluna em medicoes que rastreia o nivel atualmente esperando aprovação
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS aprovacao_nivel_atual INT;

-- ── PARTE 2: REAJUSTE CONTRATUAL ───────────────────────────────────
-- Contratos longos têm reajuste por índice (INCC, IPCA, IGPM).
-- Modelagem: o índice + periodicidade ficam no contrato; valores
-- aplicados em cada medição vão na medicao via colunas reajustadas.

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS indice_reajuste TEXT
    CHECK (indice_reajuste IN ('INCC', 'IPCA', 'IGPM', 'IGP-DI', 'manual', 'nenhum')),
  ADD COLUMN IF NOT EXISTS periodicidade_reajuste_meses INT
    CHECK (periodicidade_reajuste_meses IS NULL OR periodicidade_reajuste_meses BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS data_base_reajuste DATE,
  ADD COLUMN IF NOT EXISTS coeficiente_reajuste_atual NUMERIC(10,6) DEFAULT 1.0
    CHECK (coeficiente_reajuste_atual > 0);

-- Histórico de reajustes aplicados — pra auditoria e relatórios
CREATE TABLE IF NOT EXISTS contratos_reajustes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id       UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  data_aplicacao    DATE NOT NULL,
  indice            TEXT NOT NULL,
  variacao_pct      NUMERIC(10,4) NOT NULL,    -- ex: 4.5000 = 4.5%
  coef_anterior     NUMERIC(10,6) NOT NULL,
  coef_novo         NUMERIC(10,6) NOT NULL,
  observacao        TEXT,
  registrado_por    UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reajustes_contrato
  ON contratos_reajustes(contrato_id, data_aplicacao DESC);

-- RLS: read-only pra autenticados
ALTER TABLE fluxo_aprovacao_contrato ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos_reajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_aprov_select ON fluxo_aprovacao_contrato;
CREATE POLICY fluxo_aprov_select ON fluxo_aprovacao_contrato
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS contratos_reaj_select ON contratos_reajustes;
CREATE POLICY contratos_reaj_select ON contratos_reajustes
  FOR SELECT USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE fluxo_aprovacao_contrato IS
  'Define quais níveis de aprovação cada contrato exige (eng → coord → cliente).';
COMMENT ON TABLE contratos_reajustes IS
  'Histórico de reajustes contratuais aplicados via índice (INCC/IPCA/IGPM).';
COMMENT ON COLUMN contratos.coeficiente_reajuste_atual IS
  'Multiplicador aplicado aos valores unitários (1.0 = sem reajuste, 1.045 = +4.5%).';
