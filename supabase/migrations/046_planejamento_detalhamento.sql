-- Migration 046: Planejamento em nível de detalhamento
--
-- Permite definir % do cronograma físico/fat-direto no menor nível da EAP
-- (detalhamento 1.1.1). Os níveis superiores (tarefa 1.1 e grupo 1) são
-- agregações calculadas pela aplicação — continuam existindo as tabelas
-- antigas por grupo para não quebrar nada durante a transição.
--
-- Também migra os dados existentes de grupo → detalhamento distribuindo o
-- pct do grupo proporcionalmente ao peso (valor) de cada detalhamento:
--   físico     → pondera por valor_servico_unit  * quantidade_contratada
--   fat-direto → pondera por valor_material_unit * quantidade_contratada
--
-- Idempotente.

-- 1. Tabelas nível detalhamento
CREATE TABLE IF NOT EXISTS planejamento_fisico_det (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detalhamento_id  UUID NOT NULL REFERENCES detalhamentos(id) ON DELETE CASCADE,
  mes              DATE NOT NULL,
  pct_planejado    NUMERIC(8,4) NOT NULL DEFAULT 0,
  UNIQUE(detalhamento_id, mes)
);

CREATE TABLE IF NOT EXISTS planejamento_fat_direto_det (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detalhamento_id  UUID NOT NULL REFERENCES detalhamentos(id) ON DELETE CASCADE,
  mes              DATE NOT NULL,
  pct_planejado    NUMERIC(8,4) NOT NULL DEFAULT 0,
  UNIQUE(detalhamento_id, mes)
);

CREATE INDEX IF NOT EXISTS idx_plan_fis_det    ON planejamento_fisico_det(detalhamento_id);
CREATE INDEX IF NOT EXISTS idx_plan_fis_det_mes ON planejamento_fisico_det(mes);
CREATE INDEX IF NOT EXISTS idx_plan_fd_det     ON planejamento_fat_direto_det(detalhamento_id);
CREATE INDEX IF NOT EXISTS idx_plan_fd_det_mes ON planejamento_fat_direto_det(mes);

-- 2. Backfill: distribuir pct do grupo entre detalhamentos do grupo, ponderado
--    pelo peso de cada detalhamento no grupo. Só popula se a tabela det ainda
--    estiver vazia para aquele (detalhamento, mes) — idempotente.

-- FÍSICO: peso = valor_servico_unit * quantidade_contratada
WITH det_com_peso AS (
  SELECT d.id                                                       AS det_id,
         t.grupo_macro_id                                           AS grupo_id,
         COALESCE(d.valor_servico_unit,0) * COALESCE(d.quantidade_contratada,0) AS peso
    FROM detalhamentos d
    JOIN tarefas t ON t.id = d.tarefa_id
), grupo_peso AS (
  SELECT grupo_id, SUM(peso) AS peso_total FROM det_com_peso GROUP BY grupo_id
)
INSERT INTO planejamento_fisico_det (detalhamento_id, mes, pct_planejado)
SELECT d.det_id,
       p.mes,
       CASE WHEN gp.peso_total > 0
            THEN p.pct_planejado * (d.peso / gp.peso_total)
            ELSE p.pct_planejado  -- grupo sem peso: mesma pct para todos
       END AS pct_planejado
  FROM planejamento_fisico p
  JOIN det_com_peso d ON d.grupo_id = p.grupo_macro_id
  JOIN grupo_peso  gp ON gp.grupo_id = p.grupo_macro_id
 WHERE d.peso > 0  -- ignora det sem valor de serviço
ON CONFLICT (detalhamento_id, mes) DO NOTHING;

-- FAT-DIRETO: peso = valor_material_unit * quantidade_contratada
WITH det_com_peso AS (
  SELECT d.id                                                       AS det_id,
         t.grupo_macro_id                                           AS grupo_id,
         COALESCE(d.valor_material_unit,0) * COALESCE(d.quantidade_contratada,0) AS peso
    FROM detalhamentos d
    JOIN tarefas t ON t.id = d.tarefa_id
), grupo_peso AS (
  SELECT grupo_id, SUM(peso) AS peso_total FROM det_com_peso GROUP BY grupo_id
)
INSERT INTO planejamento_fat_direto_det (detalhamento_id, mes, pct_planejado)
SELECT d.det_id,
       p.mes,
       CASE WHEN gp.peso_total > 0
            THEN p.pct_planejado * (d.peso / gp.peso_total)
            ELSE p.pct_planejado
       END AS pct_planejado
  FROM planejamento_fat_direto p
  JOIN det_com_peso d ON d.grupo_id = p.grupo_macro_id
  JOIN grupo_peso  gp ON gp.grupo_id = p.grupo_macro_id
 WHERE d.peso > 0
ON CONFLICT (detalhamento_id, mes) DO NOTHING;
