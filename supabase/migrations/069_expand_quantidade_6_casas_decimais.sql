-- Migration 069 — Expande quantidade_medida de NUMERIC(15,4) para NUMERIC(15,6)
-- e colunas de ajuste (medicao_item_ajustes) no mesmo passo.
--
-- Contexto: 4 casas decimais não são suficientes para itens com valor unitário
-- alto onde pequenas variações de quantidade representam R$ significativos.
-- Ex.: qty=0,152231 era truncado para 0,1522 (perda de ~R$ 0,30 por item).
--
-- Mesma cadeia de dependências da migration 068.
-- Ordem: drop view → drop geradas → alter tipo → recriar geradas → recriar view

-- 1) Remove view dependente
DROP VIEW IF EXISTS vw_medicao_grupo;

-- 2) Remove colunas geradas dependentes de quantidade_medida
ALTER TABLE medicao_itens
  DROP COLUMN IF EXISTS valor_efetivo,
  DROP COLUMN IF EXISTS valor_medido;

-- 3) Expande para 6 casas decimais
ALTER TABLE medicao_itens
  ALTER COLUMN quantidade_medida TYPE NUMERIC(15,6);

-- 4) Recria valor_medido
ALTER TABLE medicao_itens
  ADD COLUMN valor_medido NUMERIC(15,2)
    GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED;

-- 5) Recria valor_efetivo
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

-- 7) Expande colunas de auditoria (só se a tabela já existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'medicao_item_ajustes'
  ) THEN
    ALTER TABLE medicao_item_ajustes
      ALTER COLUMN quantidade_anterior TYPE NUMERIC(15,6),
      ALTER COLUMN quantidade_nova     TYPE NUMERIC(15,6);
  END IF;
END $$;
