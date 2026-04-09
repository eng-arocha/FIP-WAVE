-- Migration 025: Soft-delete em solicitacoes_fat_direto
--
-- Adiciona deletado_em TIMESTAMPTZ NULLABLE. Quando preenchido, o pedido
-- é considerado excluído (lógico) e deve ser filtrado nas listagens.
-- Apenas admin pode executar a exclusão via UI.
--
-- Também registra quem excluiu (para auditoria).

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS deletado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletado_por UUID REFERENCES perfis(id) ON DELETE SET NULL;

-- Índice parcial: apenas registros ativos (deletado_em IS NULL)
CREATE INDEX IF NOT EXISTS idx_sol_fat_direto_ativos
  ON solicitacoes_fat_direto (data_solicitacao DESC)
  WHERE deletado_em IS NULL;

-- Recarrega o schema cache do PostgREST
NOTIFY pgrst, 'reload schema';
