-- ============================================================
-- 048 — Unicidade global do numero_pedido_fip
-- ============================================================
-- Hoje a sequence (migration 039) garante unicidade quando o número é
-- atribuído automaticamente. Mas o cliente PODE digitar um override
-- manualmente — e nada impede que dois pedidos compartilhem o mesmo
-- numero_pedido_fip via override.
--
-- Esta migration cria um índice único parcial:
--   - Ignora linhas com numero_pedido_fip NULL (rascunhos/legados).
--   - Ignora soft-deleted (deletado_em IS NOT NULL) para permitir
--     reaproveitamento do número se a solicitação foi descartada.
--
-- A API valida ANTES do insert e devolve 409 PEDIDO_FIP_DUPLICADO; o índice
-- é a defesa-em-profundidade contra race conditions ou bypass.
-- ============================================================

-- Limpeza preventiva: se já houver duplicatas em produção, o CREATE INDEX
-- falharia. Rodamos um log informativo (não bloqueia) para o admin tratar.
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT numero_pedido_fip
        FROM solicitacoes_fat_direto
       WHERE numero_pedido_fip IS NOT NULL
         AND deletado_em IS NULL
       GROUP BY numero_pedido_fip
      HAVING COUNT(*) > 1
    ) AS d;
  IF dup_count > 0 THEN
    RAISE NOTICE 'Atenção: % numero_pedido_fip duplicados (não soft-deleted). Resolva antes ou o CREATE INDEX falhará.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_fat_direto_numero_pedido_fip
  ON solicitacoes_fat_direto (numero_pedido_fip)
  WHERE numero_pedido_fip IS NOT NULL
    AND deletado_em IS NULL;

COMMENT ON INDEX uq_solicitacoes_fat_direto_numero_pedido_fip IS
  'Garante numero_pedido_fip único entre solicitações ativas (não soft-deleted).';
