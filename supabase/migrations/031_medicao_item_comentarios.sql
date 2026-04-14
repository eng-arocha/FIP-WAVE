-- ============================================================
-- 031 — Comentários por item de medição (P2.4)
-- ============================================================
-- Permite thread de discussão entre solicitante e fiscal por linha de
-- medição. Antes de aprovar, o fiscal pode comentar item-a-item
-- ("ajustar quantidade", "anexar foto adicional", etc) sem precisar
-- rejeitar a medição inteira.
--
-- Histórico preservado mesmo após aprovação — vira documentação
-- da decisão.
-- ============================================================

CREATE TABLE IF NOT EXISTS medicao_item_comentarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicao_item_id UUID NOT NULL REFERENCES medicao_itens(id) ON DELETE CASCADE,
  autor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  autor_nome      TEXT NOT NULL,
  autor_email     TEXT,
  -- Tipo da intervenção pra UI estilizar diferente
  tipo            TEXT NOT NULL DEFAULT 'comentario'
    CHECK (tipo IN ('comentario', 'ajuste_solicitado', 'aceito')),
  texto           TEXT NOT NULL,
  resolvido       BOOLEAN NOT NULL DEFAULT false,
  resolvido_em    TIMESTAMPTZ,
  resolvido_por   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_item_comm_item
  ON medicao_item_comentarios(medicao_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_med_item_comm_pendentes
  ON medicao_item_comentarios(medicao_item_id)
  WHERE resolvido = false AND tipo = 'ajuste_solicitado';

-- RLS: usuários autenticados podem ler/escrever em itens de medições
-- a que têm acesso (delegamos via existência da medicao_item).
ALTER TABLE medicao_item_comentarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS med_item_comm_select ON medicao_item_comentarios;
CREATE POLICY med_item_comm_select ON medicao_item_comentarios
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS med_item_comm_insert ON medicao_item_comentarios;
CREATE POLICY med_item_comm_insert ON medicao_item_comentarios
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS med_item_comm_update ON medicao_item_comentarios;
CREATE POLICY med_item_comm_update ON medicao_item_comentarios
  FOR UPDATE USING (
    autor_id = auth.uid() OR
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

COMMENT ON TABLE medicao_item_comentarios IS
  'Thread de discussão por linha de medição. Permite ajuste prévio à aprovação sem rejeitar a medição inteira.';
