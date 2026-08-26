-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 080 — Saldo a descontar do Informakon (teto de realidade)
--
-- PROBLEMA
--
-- O boletim calcula quanto DEVE ser descontado de material em cada medição.
-- O Informakon só consegue descontar nota que já está lançada LÁ. Se o
-- boletim manda descontar R$ 100 mil e o Informakon só tem R$ 50 mil
-- lançados, o lançamento não fecha — e hoje isso só se descobre na hora,
-- com a medição pronta e a NF na mão.
--
-- Isso ficou mais importante depois que a régua passou a consumir a nota até
-- o espaço CONTRATUAL do item (ver lib/db/desconto-transbordo.ts): o boletim
-- passou a pedir desconto mais cedo, o que é o objetivo, mas aumenta a chance
-- de pedir mais do que está lançado do outro lado.
--
-- SOLUÇÃO
--
-- Um retrato datado do "Vlr. a Desc" por macro item, colado direto da tabela
-- dinâmica do Informakon. O boletim compara grupo a grupo e avisa ANTES.
--
-- POR QUE NÃO REUSAR informakon_nf_linhas (migration 075)
--
-- Aquela tabela é por ENTRADA de nota ('155645/001', NOT NULL) — o retrato
-- completo do relatório xlsx. O que se cola aqui é o agregado por macro item,
-- sem nota nenhuma. Forçar um `entrada` falso poluiria a conciliação por nota
-- que já existe. São dois retratos diferentes da mesma realidade, e cada um
-- resolve uma pergunta.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS informakon_saldo_snapshots (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id       UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  -- Data a que o retrato se refere. Default hoje; o usuário pode corrigir.
  referencia        DATE NOT NULL DEFAULT CURRENT_DATE,
  informado_por_id  UUID REFERENCES perfis(id),
  informado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  /** Soma das linhas — confere contra o "Total Geral" que veio colado. */
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  /** Total Geral como veio no texto, para detectar colagem incompleta. */
  total_informado   NUMERIC(15,2),
  observacoes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_informakon_saldo_snap_contrato
  ON informakon_saldo_snapshots (contrato_id, referencia DESC, informado_em DESC);

CREATE TABLE IF NOT EXISTS informakon_saldo_linhas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id         UUID NOT NULL REFERENCES informakon_saldo_snapshots(id) ON DELETE CASCADE,
  /** Rótulo exatamente como veio colado — a prova do que foi informado. */
  macro_item          TEXT NOT NULL,
  /** De-para resolvido (lib/informakon/parser.ts). NULL = não reconhecido. */
  grupo_codigo        TEXT,
  /** '19.1.1' / '19.1.2' — o grupo 19 vem quebrado em detalhamento. */
  detalhamento_codigo TEXT,
  valor               NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_informakon_saldo_linhas_snap
  ON informakon_saldo_linhas (snapshot_id);

COMMENT ON TABLE informakon_saldo_snapshots IS
  'Retrato datado do "Vlr. a Desc" por macro item, colado do Informakon. Teto de realidade do desconto de material — o boletim avisa quando pede mais do que existe lançado lá.';

-- RLS: leitura para autenticados, gravação só via service role (as rotas usam
-- createAdminClient), igual ao padrão das tabelas da migration 075.
ALTER TABLE informakon_saldo_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE informakon_saldo_linhas    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS informakon_saldo_snap_select ON informakon_saldo_snapshots;
CREATE POLICY informakon_saldo_snap_select ON informakon_saldo_snapshots
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS informakon_saldo_linhas_select ON informakon_saldo_linhas;
CREATE POLICY informakon_saldo_linhas_select ON informakon_saldo_linhas
  FOR SELECT TO authenticated USING (true);

-- Conferência
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
   AND table_name IN ('informakon_saldo_snapshots', 'informakon_saldo_linhas');
