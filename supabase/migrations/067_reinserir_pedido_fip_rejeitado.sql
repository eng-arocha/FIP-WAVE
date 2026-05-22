-- ============================================================
-- 067 — Permite reinserir numero_pedido_fip de pedidos REJEITADOS
-- ============================================================
-- Regra de negocio: se um pedido FIP foi REJEITADO, o mesmo
-- numero_pedido_fip pode ser reinserido no sistema (novo pedido).
-- A solicitacao rejeitada PERMANECE no banco como trilha de
-- auditoria — nada eh apagado.
--
-- Para isso o indice unico parcial (migration 048) eh recriado
-- excluindo tambem as linhas com status='rejeitado'. Resultado:
--   - No maximo 1 solicitacao ATIVA (nao-rejeitada, nao-soft-deleted)
--     por numero_pedido_fip.
--   - Quantas solicitacoes REJEITADAS forem necessarias podem
--     compartilhar o mesmo numero (historico de auditoria).
--
-- A API (checkPedidoFipDuplicado) tambem ignora rejeitadas — o
-- indice eh defesa-em-profundidade contra race conditions.
--
-- Idempotente: DROP IF EXISTS + CREATE IF NOT EXISTS.
-- ============================================================

DROP INDEX IF EXISTS uq_solicitacoes_fat_direto_numero_pedido_fip;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_fat_direto_numero_pedido_fip
  ON solicitacoes_fat_direto (numero_pedido_fip)
  WHERE numero_pedido_fip IS NOT NULL
    AND deletado_em IS NULL
    AND status <> 'rejeitado';

COMMENT ON INDEX uq_solicitacoes_fat_direto_numero_pedido_fip IS
  'numero_pedido_fip unico entre solicitacoes ATIVAS. Rejeitadas e soft-deleted sao ignoradas, permitindo reinsercao do numero com trilha de auditoria.';
