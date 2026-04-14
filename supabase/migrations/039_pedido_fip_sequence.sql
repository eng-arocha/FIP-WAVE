-- ============================================================
-- 039 — Sequence PEDIDO-FIP server-side (P2.15)
-- ============================================================
-- Hoje numero_pedido_fip vem do cliente (form input). Problema:
--   - Dois solicitantes podem digitar o mesmo número
--   - Sem garantia de contiguidade (FIP-0001, FIP-0003, FIP-0005)
--   - Vulnerável a typo
--
-- Solução:
--   - Sequence Postgres dedicada (atomicidade garantida pelo banco).
--   - Helper SQL `next_pedido_fip()` retorna o próximo valor.
--   - O cliente PODE ainda passar numero_pedido_fip explícito (override
--     pra casos de migração ou correção de pedido externo). Sem isso,
--     o servidor gera automaticamente.
--
-- Compatibilidade: solicitações já existentes mantêm seu numero_pedido_fip.
-- O sequence inicia depois do MAX atual pra não colidir.
-- ============================================================

-- Cria a sequence ajustada ao MAX já existente
DO $$
DECLARE
  max_atual INT;
BEGIN
  SELECT COALESCE(MAX(numero_pedido_fip), 0) + 1 INTO max_atual
    FROM solicitacoes_fat_direto
    WHERE numero_pedido_fip IS NOT NULL;

  -- Cria ou ajusta a sequence pro próximo valor disponível
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pedido_fip_seq') THEN
    EXECUTE format('CREATE SEQUENCE pedido_fip_seq START WITH %s', max_atual);
  ELSE
    EXECUTE format('ALTER SEQUENCE pedido_fip_seq RESTART WITH %s', max_atual);
  END IF;
END $$;

-- Helper: próximo valor da sequence
CREATE OR REPLACE FUNCTION next_pedido_fip() RETURNS INT AS $$
  SELECT nextval('pedido_fip_seq')::INT;
$$ LANGUAGE sql;

-- Default no INSERT: se numero_pedido_fip for NULL, atribui automaticamente
-- via trigger (ALTER COLUMN ... SET DEFAULT não funciona com sequence
-- referenciando outra coluna em tabela sem permissão de owner do sequence)
CREATE OR REPLACE FUNCTION auto_assign_pedido_fip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero_pedido_fip IS NULL THEN
    NEW.numero_pedido_fip := nextval('pedido_fip_seq')::INT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_pedido_fip ON solicitacoes_fat_direto;
CREATE TRIGGER trg_auto_pedido_fip
  BEFORE INSERT ON solicitacoes_fat_direto
  FOR EACH ROW
  EXECUTE FUNCTION auto_assign_pedido_fip();

COMMENT ON SEQUENCE pedido_fip_seq IS
  'Sequence atômica para PEDIDO-FIP. Use nextval() ou deixe o trigger atribuir.';
COMMENT ON FUNCTION auto_assign_pedido_fip() IS
  'Atribui automaticamente numero_pedido_fip se NULL no INSERT. Permite override.';
