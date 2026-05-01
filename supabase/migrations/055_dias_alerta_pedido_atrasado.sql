-- Migration 055: Dias para alerta de pedido fat-direto atrasado
-- ----------------------------------------------------------------------
-- Configura quantos dias após a aprovação de um pedido sem NF lançada
-- (parcial ou total) o sistema considera "atrasado" e dispara o banner
-- contextual após cadastro de NF de outro pedido mais recente.
--
-- Default: 15 dias.

ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS dias_alerta_pedido_atrasado INTEGER NOT NULL DEFAULT 15;

COMMENT ON COLUMN contratos.dias_alerta_pedido_atrasado IS
  'Dias após data_aprovacao do pedido sem NF correspondente que o sistema ' ||
  'considera "atrasado". Usado pra disparar alertas pro gestor da FIP. ' ||
  'Default 15 dias. Pra alertas mensais usa-se threshold fixo de 30 dias ' ||
  '(separado, na rotina de relatório mensal).';
