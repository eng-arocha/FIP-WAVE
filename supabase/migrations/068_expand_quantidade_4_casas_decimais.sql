-- Migration 068 — Expande quantidade_medida e colunas de ajuste de NUMERIC(15,3)
-- para NUMERIC(15,4) para suportar 4 casas decimais.
--
-- Contexto: o sistema usava 3 casas decimais, mas alguns itens precisam de
-- precisão de 4 casas (ex.: 0,1522 que era truncado para 0,152 no banco).
--
-- Dependências:
--   - valor_medido é GENERATED ALWAYS AS (quantidade_medida * valor_unitario)
--   - vw_medicao_grupo depende de valor_medido
-- Solução: dropar a view, dropar a coluna gerada, alterar o tipo, recriar ambos.

-- 1) Remove view dependente
DROP VIEW IF EXISTS vw_medicao_grupo;

-- 2) Remove a coluna gerada que depende de quantidade_medida
ALTER TABLE medicao_itens DROP COLUMN IF EXISTS valor_medido;

-- 3) Expande quantidade_medida para 4 casas decimais
ALTER TABLE medicao_itens
  ALTER COLUMN quantidade_medida TYPE NUMERIC(15,4);

-- 4) Recria a coluna gerada (resultado financeiro permanece com 2 casas)
ALTER TABLE medicao_itens
  ADD COLUMN valor_medido NUMERIC(15,2)
    GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED;

-- 5) Recria a view
CREATE VIEW vw_medicao_grupo AS
SELECT
  gm.id AS grupo_id,
  gm.contrato_id,
  gm.codigo,
  gm.nome,
  gm.tipo_medicao,
  gm.valor_contratado,
  COALESCE(SUM(mi.valor_medido) FILTER (WHERE med.status = 'aprovado'), 0) AS valor_medido,
  gm.valor_contratado - COALESCE(SUM(mi.valor_medido) FILTER (WHERE med.status = 'aprovado'), 0) AS saldo
FROM grupos_macro gm
LEFT JOIN tarefas t ON t.grupo_macro_id = gm.id
LEFT JOIN detalhamentos d ON d.tarefa_id = t.id
LEFT JOIN medicao_itens mi ON mi.detalhamento_id = d.id
LEFT JOIN medicoes med ON med.id = mi.medicao_id
GROUP BY gm.id;

-- 6) Expande colunas de auditoria de ajuste
ALTER TABLE medicao_item_ajustes
  ALTER COLUMN quantidade_anterior TYPE NUMERIC(15,4),
  ALTER COLUMN quantidade_nova     TYPE NUMERIC(15,4);
