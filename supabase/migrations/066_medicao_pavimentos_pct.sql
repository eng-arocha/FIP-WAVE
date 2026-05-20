-- Migration 066: breakdown por pavimento em medicao_itens
--
-- Contexto: itens com descricao "PAV TIPO ( Xo AO Yo PAV )" tem
-- quantidade_contratada = (Y - X + 1) pavimentos. O modelo antigo media
-- esses itens por input numerico inteiro (X de Y pavtos), tratando cada
-- pavto como binario (0 ou 100%). O contrato, porem, permite medicao
-- 25/50/75/100 por pavto individualmente.
--
-- Esta migration adiciona a coluna pavimentos_pct (JSONB) em medicao_itens.
-- Formato: { "1": 100, "5": 50, "12": 75 } onde a chave eh o numero do
-- pavto e o valor eh o pct ACUMULADO desse pavto ao FIM desta medicao.
--
-- quantidade_medida continua sendo o DELTA desta medicao (compat com 3-way
-- match, retencao, dashboard, NFs, INFORMAKON, etc.). Soma(pct)/100 de
-- TODAS as medicoes aprovadas + esta = qtde acumulada total.
--
-- Items que nao casam o padrao "PAV TIPO ( ... AO ... PAV )" mantem
-- pavimentos_pct = NULL (comportamento antigo).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.

ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS pavimentos_pct JSONB;

COMMENT ON COLUMN medicao_itens.pavimentos_pct IS
  'Pct acumulado por pavimento ao fim desta medicao. Formato: {"1":100,"5":50}. NULL = item nao-pavimento-tipo (input numerico tradicional).';

-- Acelera busca da ultima medicao aprovada com breakdown para um
-- detalhamento (usado pelo endpoint /medicoes/acumulado).
CREATE INDEX IF NOT EXISTS idx_medicao_itens_pavimentos_pct
  ON medicao_itens(detalhamento_id)
  WHERE pavimentos_pct IS NOT NULL;
