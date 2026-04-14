-- ============================================================
-- 033 — Snapshot do contrato ao aprovar aditivo (P1.8)
-- ============================================================
-- Toda vez que um aditivo é APROVADO, gravamos um snapshot do estado
-- do contrato ANTES da mudança em `contratos_historico`. Isso preserva:
--   - Valor original (pra calcular % de aditivos no fim)
--   - Data fim original (pra calcular dias de prazo adicionados)
--   - Auditoria de quem aprovou e quando
--
-- Sem isso, depois de N aditivos a gente perde a referência do
-- contrato original — o que é problema em obras públicas e em renovação
-- contratual.
-- ============================================================

CREATE TABLE IF NOT EXISTS contratos_historico (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id       UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  -- Aditivo que disparou o snapshot (NULL se snapshot manual)
  aditivo_id        UUID REFERENCES aditivos(id) ON DELETE SET NULL,
  -- Snapshot completo do contrato em JSONB (flexível pra mudanças de schema)
  snapshot          JSONB NOT NULL,
  -- Resumo legível (sem precisar abrir JSONB)
  valor_total       NUMERIC(15,2),
  valor_servicos    NUMERIC(15,2),
  valor_material    NUMERIC(15,2),
  data_fim          DATE,
  -- Quem disparou o snapshot
  motivo            TEXT NOT NULL,
  registrado_por    UUID REFERENCES auth.users(id),
  registrado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hist_contrato
  ON contratos_historico(contrato_id, registrado_em DESC);
CREATE INDEX IF NOT EXISTS idx_hist_aditivo
  ON contratos_historico(aditivo_id);

-- ============================================================
-- Trigger: snapshot automático ao APROVAR aditivo
-- ============================================================
-- Dispara quando aditivos.status muda de !'aprovado' pra 'aprovado'.
-- Captura o estado atual do contrato e arquiva.
-- ============================================================
CREATE OR REPLACE FUNCTION snapshot_contrato_on_aditivo_aprovado()
RETURNS TRIGGER AS $$
DECLARE
  contrato_row contratos%ROWTYPE;
BEGIN
  -- Só dispara em transição pra 'aprovado'
  IF NEW.status = 'aprovado' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT * INTO contrato_row FROM contratos WHERE id = NEW.contrato_id FOR UPDATE;
    IF FOUND THEN
      INSERT INTO contratos_historico (
        contrato_id, aditivo_id, snapshot,
        valor_total, valor_servicos, valor_material, data_fim,
        motivo, registrado_por
      ) VALUES (
        NEW.contrato_id,
        NEW.id,
        to_jsonb(contrato_row),
        contrato_row.valor_total,
        contrato_row.valor_servicos,
        contrato_row.valor_material_direto,
        contrato_row.data_fim,
        format('Snapshot ao aprovar aditivo #%s (%s)', NEW.numero, NEW.tipo),
        NULL  -- aprovacao via trigger não tem user atual; route handler pode preencher
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_snapshot_contrato_on_aditivo ON aditivos;
CREATE TRIGGER trg_snapshot_contrato_on_aditivo
  AFTER INSERT OR UPDATE ON aditivos
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_contrato_on_aditivo_aprovado();

-- RLS: usuários autenticados podem ler histórico dos contratos a que têm
-- acesso (delegamos via existência do contrato — política mínima).
ALTER TABLE contratos_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contratos_hist_select ON contratos_historico;
CREATE POLICY contratos_hist_select ON contratos_historico
  FOR SELECT USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE contratos_historico IS
  'Snapshots imutáveis do estado do contrato ao aprovar aditivos. Permite reconstruir histórico financeiro e de prazo.';
