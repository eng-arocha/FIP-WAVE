-- Migration 054: Pedido de cobertura de divergência + tipo de rejeição
-- ----------------------------------------------------------------------
-- Permite distinguir solicitações criadas como "cobertura" de divergência
-- de outras NFs (linka via origem_divergencia_id) e tipifica rejeições
-- de NF (sem precisar criar status novo no enum).

-- 1) Pedido de cobertura: link pro pedido pai
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS origem_divergencia_id UUID REFERENCES solicitacoes_fat_direto(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_divergencia_nf_id UUID REFERENCES notas_fiscais_fat_direto(id) ON DELETE SET NULL;

COMMENT ON COLUMN solicitacoes_fat_direto.origem_divergencia_id IS
  'Quando preenchido, indica que esta solicitação foi criada automaticamente pra cobrir a divergência de valor de uma NF lançada no pedido aqui referenciado.';
COMMENT ON COLUMN solicitacoes_fat_direto.origem_divergencia_nf_id IS
  'NF que originou a cobertura (excedeu o saldo do pedido pai).';

CREATE INDEX IF NOT EXISTS idx_sol_fatd_origem_divergencia
  ON solicitacoes_fat_direto(origem_divergencia_id)
  WHERE origem_divergencia_id IS NOT NULL;

-- 2) Tipificação de rejeição da NF (sem mexer no enum de status)
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS tipo_rejeicao TEXT;

COMMENT ON COLUMN notas_fiscais_fat_direto.tipo_rejeicao IS
  'Razão da rejeição: divergencia_sem_saldo, fornecedor_errado, fora_de_escopo, outro. Texto livre, mas usa-se valores padronizados pra filtro/relatório.';

CREATE INDEX IF NOT EXISTS idx_nf_fatd_tipo_rejeicao
  ON notas_fiscais_fat_direto(tipo_rejeicao)
  WHERE tipo_rejeicao IS NOT NULL;
