-- Migration 057: Ajuste de saldo de pedido por divergência (sem pedido novo)
-- ----------------------------------------------------------------------
-- Substitui o fluxo de "criar pedido de cobertura" da Migration 054
-- pelo fluxo de "ajustar saldo do pedido existente":
--   - valor_aprovado_original guarda o valor da 1ª aprovação formal
--     (snapshot pra auditoria — preenchido só na 1ª vez que houver ajuste)
--   - ajustes_divergencia guarda histórico de cada ajuste em jsonb
--     [{nf_id, excedente, motivo, data, valor_anterior, valor_novo,
--       ajustado_por_id, tipo}]
--   - valor_total reflete o atual (com ajustes aplicados)

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS valor_aprovado_original NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS ajustes_divergencia JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN solicitacoes_fat_direto.valor_aprovado_original IS
  'Snapshot do valor_total na 1ª aprovação formal. NULL = pedido nunca foi ajustado por divergência. Preenchido automaticamente na 1ª divergência.';
COMMENT ON COLUMN solicitacoes_fat_direto.ajustes_divergencia IS
  'Histórico jsonb de ajustes por divergência: [{nf_id, excedente, motivo, data, valor_anterior, valor_novo, ajustado_por_id, tipo}]. tipo: "divergencia_nf" (fluxo normal) ou "ajuste_retroativo" (correção manual).';

CREATE INDEX IF NOT EXISTS idx_sol_fatd_ajustes
  ON solicitacoes_fat_direto((jsonb_array_length(ajustes_divergencia)))
  WHERE jsonb_array_length(ajustes_divergencia) > 0;
