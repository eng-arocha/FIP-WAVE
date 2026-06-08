-- Migration 068 — Expande quantidade_medida e colunas de ajuste de NUMERIC(15,3)
-- para NUMERIC(15,4) para suportar 4 casas decimais.
--
-- Contexto: o sistema usava 3 casas decimais, mas alguns itens precisam de
-- precisão de 4 casas (ex.: 0,1522 que era truncado para 0,152 no banco).
--
-- Árvore de dependências de quantidade_medida:
--   quantidade_medida
--   ├── valor_medido  (GENERATED: quantidade_medida * valor_unitario)
--   │   └── vw_medicao_grupo (VIEW usa valor_medido)
--   └── valor_efetivo (GENERATED: quantidade_medida * valor_unitario - valor_glosa)
--
-- Ordem: drop view → drop geradas → alter tipo → recriar geradas → recriar view

-- 1) Remove view que depende de valor_medido
DROP VIEW IF EXISTS vw_medicao_grupo;

-- 2) Remove colunas geradas que dependem de quantidade_medida
ALTER TABLE medicao_itens
  DROP COLUMN IF EXISTS valor_efetivo,
  DROP COLUMN IF EXISTS valor_medido;

-- 3) Expande quantidade_medida para 4 casas decimais
ALTER TABLE medicao_itens
  ALTER COLUMN quantidade_medida TYPE NUMERIC(15,4);

-- 4) Recria valor_medido (resultado financeiro permanece com 2 casas)
ALTER TABLE medicao_itens
  ADD COLUMN valor_medido NUMERIC(15,2)
    GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED;

-- 5) Recria valor_efetivo (glosa — migration 030)
ALTER TABLE medicao_itens
  ADD COLUMN valor_efetivo NUMERIC(15,2)
    GENERATED ALWAYS AS (
      (COALESCE(quantidade_medida, 0) * COALESCE(valor_unitario, 0))
      - COALESCE(valor_glosa, 0)
    ) STORED;

-- 6) Recria vw_medicao_grupo
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

-- 7) Expande colunas de auditoria de ajuste (só se a tabela já existe — migration 061)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'medicao_item_ajustes'
  ) THEN
    ALTER TABLE medicao_item_ajustes
      ALTER COLUMN quantidade_anterior TYPE NUMERIC(15,4),
      ALTER COLUMN quantidade_nova     TYPE NUMERIC(15,4);
  END IF;
END $$;
