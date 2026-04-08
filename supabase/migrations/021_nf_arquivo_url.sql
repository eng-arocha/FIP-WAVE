-- Adiciona coluna arquivo_url para upload do PDF da NF
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS arquivo_url TEXT;
