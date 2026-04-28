-- ============================================================
-- 050 — Encerrar pedido com devolução de saldo aos itens
-- ============================================================
-- Cenário: pedido aprovado por R$ 6.000 recebe NF de R$ 3.500. Os R$ 2.500
-- restantes ficam comprometidos contra os itens originais sem necessidade.
-- Esta migration permite que o admin "encerre" o pedido devolvendo o saldo
-- a cada item, liberando-o pra outros pedidos.
--
-- Modelo:
--   - itens_solicitacao_fat_direto.valor_devolvido (NUMERIC) — quanto desse
--     item foi devolvido. Saldo efetivo = (valor_unitario - valor_devolvido).
--   - solicitacoes_fat_direto.status pode ser 'encerrado' (estado final).
--   - data_encerramento + encerrado_por_id + motivo_encerramento — auditoria.
--
-- Cálculo de saldo do detalhamento (em lib/db/fat-direto.ts) é atualizado
-- pra usar (valor_unitario - valor_devolvido) em vez de só valor_unitario.
-- ============================================================

-- 1) Coluna de devolução por item
ALTER TABLE itens_solicitacao_fat_direto
  ADD COLUMN IF NOT EXISTS valor_devolvido NUMERIC NOT NULL DEFAULT 0
    CHECK (valor_devolvido >= 0);

COMMENT ON COLUMN itens_solicitacao_fat_direto.valor_devolvido IS
  'Quanto desse item foi devolvido (encerramento de pedido). Saldo efetivo = valor_unitario - valor_devolvido.';

-- 2) Auditoria do encerramento
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS data_encerramento TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS encerrado_por_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT;

COMMENT ON COLUMN solicitacoes_fat_direto.motivo_encerramento IS
  'Justificativa do admin ao encerrar pedido aprovado e devolver saldo aos itens.';

-- 3) Status 'encerrado' (estado final, irreversível pelo fluxo normal)
DO $$
DECLARE
  cons_def TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cons_def
    FROM pg_constraint
   WHERE conname = 'solicitacoes_fat_direto_status_check'
     AND conrelid = 'solicitacoes_fat_direto'::regclass;

  -- Se já cobre 'encerrado', nada a fazer (idempotência)
  IF cons_def IS NOT NULL AND cons_def LIKE '%encerrado%' THEN
    RAISE NOTICE 'Constraint de status já inclui ''encerrado'' — ok.';
  ELSE
    IF cons_def IS NOT NULL THEN
      EXECUTE 'ALTER TABLE solicitacoes_fat_direto DROP CONSTRAINT solicitacoes_fat_direto_status_check';
    END IF;
    ALTER TABLE solicitacoes_fat_direto
      ADD CONSTRAINT solicitacoes_fat_direto_status_check
      CHECK (status IN (
        'rascunho','aguardando_aprovacao','aprovado','rejeitado','cancelado','encerrado'
      ));
    RAISE NOTICE 'Constraint de status atualizada para incluir ''encerrado''.';
  END IF;
END $$;

-- 4) Índice ajuda buscas/relatórios por encerrados (não-único, defensivo)
CREATE INDEX IF NOT EXISTS idx_sol_fat_direto_status_encerramento
  ON solicitacoes_fat_direto (status, data_encerramento DESC)
  WHERE status = 'encerrado';
