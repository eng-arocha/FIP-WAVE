-- Migration 068 — Expande quantidade_medida e colunas de ajuste de NUMERIC(15,3)
-- para NUMERIC(15,4) para suportar 4 casas decimais.
--
-- Contexto: o sistema usava 3 casas decimais, mas alguns itens precisam de
-- precisão de 4 casas (ex.: 0,1522 que era truncado para 0,152 no banco).
--
-- Nota: valor_medido é GENERATED ALWAYS AS (quantidade_medida * valor_unitario).
-- Para alterar o tipo de quantidade_medida é necessário dropar a coluna gerada,
-- alterar o tipo e recriar.

-- 1) Remove a coluna gerada que depende de quantidade_medida
ALTER TABLE medicao_itens DROP COLUMN IF EXISTS valor_medido;

-- 2) Expande quantidade_medida para 4 casas decimais
ALTER TABLE medicao_itens
  ALTER COLUMN quantidade_medida TYPE NUMERIC(15,4);

-- 3) Recria a coluna gerada (resultado financeiro permanece com 2 casas)
ALTER TABLE medicao_itens
  ADD COLUMN valor_medido NUMERIC(15,2)
    GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED;

-- 4) Expande colunas de auditoria de ajuste
ALTER TABLE medicao_item_ajustes
  ALTER COLUMN quantidade_anterior TYPE NUMERIC(15,4),
  ALTER COLUMN quantidade_nova     TYPE NUMERIC(15,4);
