-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 085 — Compensação de lastro entre macro itens
--
-- PROBLEMA
--
-- O Informakon só abate nota lançada no MESMO macro item. Quando a nota do
-- material de um macro item (ex.: ELÉTRICA SUBESTAÇÃO) foi lançada em outro
-- (ex.: QUADROS ELÉTRICOS), o primeiro fica sem lastro e o segundo fica com
-- lastro sobrando. Lançamento feito no ERP não se move.
--
-- REGRA (usuário, 26/10/2026)
--
-- A FIP fatura a falta do macro item sem lastro, e o SALDO A GASTAR dos itens
-- do macro item onde a nota está é reduzido no mesmo valor, começando pelos
-- primeiros itens. A nota parada lá vai abater material daquele macro item
-- no futuro; sem a redução, alguém compraria de novo esse material e a obra
-- pagaria duas vezes.
--
-- Uma compensação é registrada NA MEDIÇÃO em que foi decidida. A redução de
-- saldo é gravada item a item (`compensacoes_lastro_itens`), para que o saldo
-- por item e a trava de novo pedido leiam o mesmo número.
--
-- Idempotente. Sem a migration, o boletim e o saldo por item seguem como antes.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compensacoes_lastro (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  medicao_id      UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  /** Macro item sem lastro — onde a FIP fatura ('1'..'18' ou '19.1.x'). */
  chave_falta     TEXT NOT NULL,
  /** Macro item onde a nota foi lançada no ERP — onde o saldo é reduzido. */
  chave_nota      TEXT NOT NULL,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  /** Números das notas que estão no macro item da nota (referência). */
  notas           TEXT[] NOT NULL DEFAULT '{}',
  motivo          TEXT,
  criado_por_id   UUID REFERENCES perfis(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (chave_falta <> chave_nota)
);

CREATE INDEX IF NOT EXISTS idx_compensacoes_lastro_contrato
  ON compensacoes_lastro (contrato_id);
CREATE INDEX IF NOT EXISTS idx_compensacoes_lastro_medicao
  ON compensacoes_lastro (medicao_id);

CREATE TABLE IF NOT EXISTS compensacoes_lastro_itens (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  compensacao_id   UUID NOT NULL REFERENCES compensacoes_lastro(id) ON DELETE CASCADE,
  detalhamento_id  UUID NOT NULL REFERENCES detalhamentos(id),
  valor            NUMERIC(15,2) NOT NULL CHECK (valor > 0)
);

CREATE INDEX IF NOT EXISTS idx_compensacoes_lastro_itens_comp
  ON compensacoes_lastro_itens (compensacao_id);
CREATE INDEX IF NOT EXISTS idx_compensacoes_lastro_itens_det
  ON compensacoes_lastro_itens (detalhamento_id);

COMMENT ON TABLE compensacoes_lastro IS
  'Falta de lastro de um macro item paga pela FIP, compensada reduzindo o saldo a gastar do macro item onde a nota foi lançada no ERP.';

-- RLS: leitura para autenticados, gravação só via service role (as rotas usam
-- createAdminClient), igual ao padrão das migrations 075/080.
ALTER TABLE compensacoes_lastro       ENABLE ROW LEVEL SECURITY;
ALTER TABLE compensacoes_lastro_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compensacoes_lastro_select ON compensacoes_lastro;
CREATE POLICY compensacoes_lastro_select ON compensacoes_lastro
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS compensacoes_lastro_itens_select ON compensacoes_lastro_itens;
CREATE POLICY compensacoes_lastro_itens_select ON compensacoes_lastro_itens
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';

-- Conferência
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('compensacoes_lastro', 'compensacoes_lastro_itens');
