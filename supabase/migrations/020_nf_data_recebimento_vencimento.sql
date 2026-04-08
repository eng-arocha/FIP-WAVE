-- Adiciona campos data_recebimento e data_vencimento na tabela de notas fiscais
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS data_recebimento DATE,
  ADD COLUMN IF NOT EXISTS data_vencimento DATE;
