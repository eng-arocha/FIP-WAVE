-- Migration 024: Garantir coluna template_id em perfis e recarregar schema cache
--
-- Origem do problema: a edição de usuário estava falhando com
--   "Could not find the 'template_id' column of 'perfis' in the schema cache"
-- A coluna foi originalmente adicionada na migration 012, mas em alguns
-- ambientes ela não foi aplicada OU o PostgREST está com cache estale.
--
-- Esta migration:
-- 1) Garante que a coluna existe (idempotente — IF NOT EXISTS)
-- 2) Garante o índice
-- 3) Força recarga do schema cache do PostgREST via NOTIFY

-- 1) Coluna template_id (idempotente)
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates_permissao(id) ON DELETE SET NULL;

-- 2) Índice (idempotente)
CREATE INDEX IF NOT EXISTS idx_perfis_template ON perfis(template_id);

-- 3) Recarrega o schema cache do PostgREST
-- Sem isto, o PostgREST pode continuar reportando "column not found"
-- mesmo depois da coluna ter sido adicionada, até a próxima reinicialização.
NOTIFY pgrst, 'reload schema';
