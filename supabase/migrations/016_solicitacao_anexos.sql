-- Migration 016: suporte a múltiplos anexos por solicitação de faturamento direto
-- Adiciona coluna JSONB para lista de anexos { nome, url, tamanho, tipo }

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS pedido_anexos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN solicitacoes_fat_direto.pedido_anexos IS
  'Lista de anexos do pedido: [{nome, url, tamanho, tipo}]';
