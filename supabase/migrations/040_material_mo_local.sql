-- ============================================================
-- 040 — Alinha schema à planilha oficial + subtotais/disciplina
-- ============================================================
-- Colunas que JÁ existem no detalhamentos (migration 005):
--   valor_material_unit, valor_servico_unit, local, valor_unitario (coluna regular)
--
-- O que esta migration faz:
--   1) Adiciona `disciplina` em detalhamentos, tarefas e grupos_macro
--      (espelha coluna "DISCIPLINA" da planilha).
--   2) Adiciona subtotal_material e subtotal_mo em detalhamentos como
--      GENERATED pra UI evitar recalculo e poder indexar/ordenar.
--   3) Cria função/view de consistência pra detectar divergências entre
--      cabeçalho de tarefa e soma dos detalhamentos filhos.
-- ============================================================

-- ── detalhamentos ──────────────────────────────────────────────────
ALTER TABLE detalhamentos
  ADD COLUMN IF NOT EXISTS disciplina TEXT;

-- Subtotais pra UI — calculados automaticamente a partir de qtde × unit
-- Se valor_material_unit ou valor_servico_unit for 0/NULL, vira 0.
ALTER TABLE detalhamentos
  ADD COLUMN IF NOT EXISTS subtotal_material NUMERIC(15,2)
    GENERATED ALWAYS AS (
      COALESCE(quantidade_contratada, 0) * COALESCE(valor_material_unit, 0)
    ) STORED,
  ADD COLUMN IF NOT EXISTS subtotal_mo NUMERIC(15,2)
    GENERATED ALWAYS AS (
      COALESCE(quantidade_contratada, 0) * COALESCE(valor_servico_unit, 0)
    ) STORED;

-- ── tarefas ────────────────────────────────────────────────────────
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS disciplina TEXT,
  ADD COLUMN IF NOT EXISTS local      TEXT;

-- ── grupos_macro ───────────────────────────────────────────────────
ALTER TABLE grupos_macro
  ADD COLUMN IF NOT EXISTS disciplina TEXT;

-- ── Índices úteis pros novos campos ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_detalh_local      ON detalhamentos(local);
CREATE INDEX IF NOT EXISTS idx_detalh_disciplina ON detalhamentos(disciplina);
CREATE INDEX IF NOT EXISTS idx_detalh_codigo     ON detalhamentos(codigo);
CREATE INDEX IF NOT EXISTS idx_tarefa_disciplina ON tarefas(disciplina);

-- ── View de consistência: tarefas com divergência cabeça vs filhos ──
-- Útil pra debug e tela admin de health check do orçamento.
CREATE OR REPLACE VIEW vw_orcamento_divergencias AS
SELECT
  t.id                    AS tarefa_id,
  t.codigo                AS tarefa_codigo,
  t.nome                  AS tarefa_nome,
  gm.contrato_id,
  t.valor_unitario        AS valor_unit_tarefa_cabeca,
  t.valor_total           AS valor_total_tarefa_cabeca,
  COALESCE(SUM(d.subtotal_material + d.subtotal_mo), 0) AS soma_filhos_total,
  t.valor_total - COALESCE(SUM(d.subtotal_material + d.subtotal_mo), 0) AS diferenca
FROM tarefas t
JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
LEFT JOIN detalhamentos d ON d.tarefa_id = t.id
GROUP BY t.id, t.codigo, t.nome, gm.contrato_id, t.valor_unitario, t.valor_total
HAVING ABS(t.valor_total - COALESCE(SUM(d.subtotal_material + d.subtotal_mo), 0)) > 0.01;

COMMENT ON VIEW vw_orcamento_divergencias IS
  'Lista tarefas cuja soma dos detalhamentos difere do valor do cabeçalho. Útil pra diagnóstico.';

COMMENT ON COLUMN detalhamentos.subtotal_material IS
  'GENERATED: qtde × valor_material_unit. Fonte da verdade pro teto material no Fat. Direto.';
COMMENT ON COLUMN detalhamentos.subtotal_mo IS
  'GENERATED: qtde × valor_servico_unit. Fonte da verdade pra MO.';
