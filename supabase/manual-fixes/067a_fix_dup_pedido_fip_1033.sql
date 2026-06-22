-- ============================================================
-- 067a — Correcao de dado: pedido FIP duplicado 1033
-- ============================================================
-- Dois pedidos APROVADOS distintos receberam numero_pedido_fip=1033
-- por erro de digitacao:
--   - PL INDUSTRIA METALURGICA (fe748038...)  R$ 31.196,17
--   - VTK TUBOS E CONEXOES     (0f10313c...)  R$ 298.948,30
--
-- Decisao do gestor:
--   - PL  → MANTEM FIP-1033
--   - VTK → CORRIGIDO para FIP-1034
--
-- Este script:
--   1. Valida que 1034 nao esta em uso por outra solicitacao ativa
--   2. Renumera a VTK de 1033 para 1034
--   3. Recria o indice unico parcial (migration 067) — agora viavel
--      porque a duplicata foi resolvida
--
-- Idempotente: o UPDATE so afeta a linha se ela ainda estiver em 1033.
-- ============================================================

DO $$
DECLARE
  conflito INT;
BEGIN
  -- Trava de seguranca: 1034 nao pode estar ocupado por outra ativa
  SELECT COUNT(*) INTO conflito
    FROM solicitacoes_fat_direto
   WHERE numero_pedido_fip = 1034
     AND deletado_em IS NULL
     AND status <> 'rejeitado'
     AND id <> '0f10313c-1dca-4b60-ae52-0cece1ff7efe';

  IF conflito > 0 THEN
    RAISE EXCEPTION
      'Abortado: numero_pedido_fip 1034 ja esta em uso por % solicitacao(oes) ativa(s). Resolva esse conflito antes.', conflito;
  END IF;

  UPDATE solicitacoes_fat_direto
     SET numero_pedido_fip = 1034,
         updated_at = NOW()
   WHERE id = '0f10313c-1dca-4b60-ae52-0cece1ff7efe'
     AND numero_pedido_fip = 1033;

  IF FOUND THEN
    RAISE NOTICE 'OK: VTK TUBOS E CONEXOES (0f10313c) renumerado de FIP-1033 para FIP-1034.';
  ELSE
    RAISE NOTICE 'Nada a fazer: VTK (0f10313c) ja nao estava em 1033 (script ja rodado?).';
  END IF;
END $$;

-- Recria o indice unico parcial (migration 067) — agora sem duplicatas.
DROP INDEX IF EXISTS uq_solicitacoes_fat_direto_numero_pedido_fip;

CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitacoes_fat_direto_numero_pedido_fip
  ON solicitacoes_fat_direto (numero_pedido_fip)
  WHERE numero_pedido_fip IS NOT NULL
    AND deletado_em IS NULL
    AND status <> 'rejeitado';

COMMENT ON INDEX uq_solicitacoes_fat_direto_numero_pedido_fip IS
  'numero_pedido_fip unico entre solicitacoes ATIVAS. Rejeitadas e soft-deleted sao ignoradas, permitindo reinsercao do numero com trilha de auditoria.';
