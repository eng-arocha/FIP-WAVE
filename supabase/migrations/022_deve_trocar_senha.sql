-- Migration 022: Flag para forçar troca de senha no próximo acesso
-- Usado para detectar usuários com senha padrão "12345678" ou
-- quando o admin redefine a senha para um valor temporário.

ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS deve_trocar_senha BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial só dos que precisam trocar (muito menor e rápido)
CREATE INDEX IF NOT EXISTS idx_perfis_deve_trocar_senha
  ON perfis (id) WHERE deve_trocar_senha = true;
