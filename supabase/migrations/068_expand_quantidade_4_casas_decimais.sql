-- Migration 068 — Expande quantidade_medida e colunas de ajuste de NUMERIC(15,3)
-- para NUMERIC(15,4) para suportar 4 casas decimais.
--
-- Contexto: o sistema usava 3 casas decimais, mas alguns itens precisam de
-- precisão de 4 casas (ex.: 0,1522 que era truncado para 0,152 no banco).

ALTER TABLE medicao_itens
  ALTER COLUMN quantidade_medida TYPE NUMERIC(15,4);

ALTER TABLE medicao_item_ajustes
  ALTER COLUMN quantidade_anterior TYPE NUMERIC(15,4),
  ALTER COLUMN quantidade_nova     TYPE NUMERIC(15,4);
