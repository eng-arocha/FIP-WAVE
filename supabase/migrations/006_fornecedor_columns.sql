-- Migration 006: Add supplier (fornecedor) columns to solicitacoes_fat_direto
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS fornecedor_razao_social TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS fornecedor_contato TEXT;
