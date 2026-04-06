-- Migration 009: Nivel 3 (detalhamento) support in fat direto + new required fields
-- Run in Supabase SQL Editor

-- 1. Add detalhamento_id to itens (links item to specific nivel-3 row)
ALTER TABLE itens_solicitacao_fat_direto
  ADD COLUMN IF NOT EXISTS detalhamento_id UUID REFERENCES detalhamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_itens_sol_detalhamento
  ON itens_solicitacao_fat_direto(detalhamento_id);

-- 2. Add numero_pedido_fip to solicitacoes (mandatory internal FIP order number)
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS numero_pedido_fip INTEGER;

-- 3. Add separate contact fields (contato_nome / contato_telefone)
--    fornecedor_contato remains for backward compat
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS fornecedor_contato_nome      TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_contato_telefone  TEXT;
