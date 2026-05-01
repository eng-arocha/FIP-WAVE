-- Migration 053: Tolerância de divergência de valor em NFs de fat-direto
-- ----------------------------------------------------------------------
-- Permite que o contrato configure uma tolerância (R$) para divergência
-- entre o valor da NF e o saldo do pedido fat-direto. Dentro da tolerância,
-- a NF é aceita silenciosamente (com flag pra auditoria). Acima dela,
-- o aprovador precisa autorizar explicitamente via override + motivo.
--
-- Idempotente: pode rodar várias vezes.

-- 1) Tolerância configurável por contrato (default 0 = comportamento estrito)
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS tolerancia_nf_valor NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN contratos.tolerancia_nf_valor IS
  'Tolerância (R$) para divergência entre valor da NF e saldo do pedido fat-direto. NFs com diferença <= esta tolerância são aceitas com flag de divergência. NFs com diferença > esta tolerância exigem override explícito.';

-- 2) Flags de divergência na NF
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS divergencia_valor      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS divergencia_excedente  NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS override_excede_saldo  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS motivo_divergencia     TEXT;

COMMENT ON COLUMN notas_fiscais_fat_direto.divergencia_valor IS
  'true se a NF teve divergência de valor (>R$0,01) em relação ao saldo do pedido, mesmo dentro da tolerância configurada do contrato.';
COMMENT ON COLUMN notas_fiscais_fat_direto.divergencia_excedente IS
  'Valor (R$) que excedeu o saldo. Positivo = NF maior que saldo. Pode ser negativo se a NF for menor que o saldo (e a divergência foi sinalizada).';
COMMENT ON COLUMN notas_fiscais_fat_direto.override_excede_saldo IS
  'true quando o aprovador autorizou explicitamente NF que excede a tolerância.';
COMMENT ON COLUMN notas_fiscais_fat_direto.motivo_divergencia IS
  'Justificativa obrigatória quando override_excede_saldo=true. Auditável.';

-- 3) Índice pra relatórios de divergência
CREATE INDEX IF NOT EXISTS idx_nf_fatd_divergencia
  ON notas_fiscais_fat_direto(divergencia_valor)
  WHERE divergencia_valor = TRUE;
