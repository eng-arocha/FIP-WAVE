-- =============================================================
-- Migration 008: Coluna `disciplina` + realinhamento com BASE oficial
-- Adiciona disciplina nos 3 níveis (grupos_macro, tarefas, detalhamentos)
-- Permite agrupar/filtrar por disciplina (ELÉTRICA, HIDRÁULICA, INCÊNDIO, ...)
-- =============================================================

ALTER TABLE grupos_macro
  ADD COLUMN IF NOT EXISTS disciplina TEXT;

ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS disciplina TEXT;

ALTER TABLE detalhamentos
  ADD COLUMN IF NOT EXISTS disciplina TEXT;

-- Index pra filtros rápidos
CREATE INDEX IF NOT EXISTS idx_detalhamentos_disciplina ON detalhamentos(disciplina);
CREATE INDEX IF NOT EXISTS idx_tarefas_disciplina ON tarefas(disciplina);
