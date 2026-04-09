-- Migration 027: Auditoria de desaprovação de solicitações fat-direto
--
-- Quando um admin (ou usuário com permissão de aprovar) "desaprovar"
-- uma solicitação já aprovada, ela volta ao status 'rascunho' e
-- registramos quem, quando e por qual motivo a desaprovação aconteceu.
--
-- Escolha de design: 3 colunas dedicadas em vez de JSONB histórico
-- porque só precisamos da ÚLTIMA desaprovação (a anterior vira
-- irrelevante quando o pedido volta pra fila e é re-aprovado).
-- Se for re-aprovado, limpamos essas colunas no flow de aprovar.

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS desaprovado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS desaprovado_por     UUID REFERENCES perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_desaprovacao TEXT;

-- Índice parcial: busca rápida de desaprovações para auditoria
CREATE INDEX IF NOT EXISTS idx_sol_fat_direto_desaprovadas
  ON solicitacoes_fat_direto (desaprovado_em DESC)
  WHERE desaprovado_em IS NOT NULL;

-- Recarrega schema cache
NOTIFY pgrst, 'reload schema';
