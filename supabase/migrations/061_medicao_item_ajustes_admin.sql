-- Migration 061 — Ajustes de quantidade feitos pelo admin durante a aprovação
-- da medição.
--
-- Caso de uso: o aprovador (admin) abre o boletim Informakon de uma medição
-- pendente e percebe que o solicitante esqueceu de medir o item 19
-- (Administração da Obra) ou colocou quantidade errada em outro item. Em vez
-- de rejeitar a medição inteira (e o solicitante refazer), o admin ajusta
-- a quantidade direto, deixando rastro completo: valor anterior, valor novo,
-- motivo obrigatório, quem ajustou, quando.
--
-- A tabela é apenas histórico de auditoria. A coluna `quantidade_medida` em
-- `medicao_itens` é atualizada pra o valor novo na mesma operação (transação).
-- Cada ajuste vira uma linha aqui, então um item pode ter N ajustes encadeados.
--
-- O email de liberação de NF (após aprovação) lê esta tabela pra renderizar
-- o bloco "Ajustes feitos pelo admin nesta medição" — o solicitante toma
-- ciência via email sem precisar entrar no sistema.

CREATE TABLE IF NOT EXISTS medicao_item_ajustes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicao_item_id     UUID NOT NULL REFERENCES medicao_itens(id) ON DELETE CASCADE,
  quantidade_anterior NUMERIC(15,3) NOT NULL,
  quantidade_nova     NUMERIC(15,3) NOT NULL,
  motivo              TEXT NOT NULL,
  ajustado_por_id     UUID NOT NULL REFERENCES perfis(id),
  ajustado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT motivo_min_chars CHECK (length(motivo) >= 10),
  CONSTRAINT qty_distintas CHECK (quantidade_anterior <> quantidade_nova),
  CONSTRAINT qty_nao_negativa CHECK (quantidade_nova >= 0)
);

CREATE INDEX IF NOT EXISTS idx_medicao_item_ajustes_item
  ON medicao_item_ajustes(medicao_item_id);

CREATE INDEX IF NOT EXISTS idx_medicao_item_ajustes_ajustado_em
  ON medicao_item_ajustes(ajustado_em DESC);

-- RLS: leitura aberta pra usuários autenticados, gravação só via service role
-- (a rota PATCH usa createAdminClient).
ALTER TABLE medicao_item_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medicao_item_ajustes_select ON medicao_item_ajustes;
CREATE POLICY medicao_item_ajustes_select ON medicao_item_ajustes
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert/update/delete: apenas service_role (bypass automático via supabase admin client)

COMMENT ON TABLE medicao_item_ajustes IS
  'Histórico de ajustes de quantidade feitos pelo admin durante a aprovação da medição. Cada linha registra a transição de quantidade_medida com motivo obrigatório.';

COMMENT ON COLUMN medicao_item_ajustes.motivo IS
  'Justificativa do ajuste, mínimo 10 caracteres. Aparece no email pro solicitante e no histórico.';
