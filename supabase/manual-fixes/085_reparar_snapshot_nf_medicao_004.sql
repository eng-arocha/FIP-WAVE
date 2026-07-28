-- ---------------------------------------------------------------------------
-- 085 — Reparar o snapshot de NF abatida da MED-004 (desconto em dobro)
--
-- O DEFEITO:
--
-- A MED-004 foi aprovada ANTES de o código que grava
-- `medicao_itens.nf_material_descontada` existir. O único preenchimento
-- possível para ela veio do backfill da migration 074, que apura
-- LEAST(material_medido_do_item, nf_alocada_AO_ITEM) — per-detalhamento puro,
-- sem o transbordo por grupo macro (que só entrou depois).
--
-- Onde a cobertura veio por transbordo — a nota alocada a um detalhamento
-- VIZINHO do mesmo grupo — o backfill calculou 0 para a linha medida, o
-- filtro `AND c.valor > 0` pulou a linha, e a coluna ficou no DEFAULT 0.
-- E como o backfill é `WHERE nf_material_descontada = 0` (write-once-if-zero),
-- rodá-lo de novo NÃO repara: linha calculada-como-zero é indistinguível de
-- linha nunca tocada.
--
-- CONSEQUÊNCIA: o saldo corrido não enxerga o que a MED-004 abateu, e a mesma
-- nota é descontada de novo na MED-005. No grupo 16 (SDAI) isso apareceu como
-- NF descontada de R$ 51.923,99 contra material medido de R$ 44.709,26 —
-- R$ 7.214,73 a mais, exatamente o que a MED-004 abateu e não registrou.
--
-- M1 e M2 são SOMENTE LEITURA (confirmam o diagnóstico antes de mexer).
-- M3 escreve. Rode M1 e M2 primeiro e confira os números.
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição 004: a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- M1 — Confirma o diagnóstico: NF no próprio item x NF no grupo macro
--
-- Se `nf_alocada_no_item` for ~0 e `nf_alocada_no_grupo` cobrir o material
-- medido, está confirmado que a cobertura veio por transbordo e que por isso
-- o backfill da 074 pulou a linha.
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)  AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)        AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
)
SELECT g.codigo AS grupo,
       d.codigo,
       d.descricao,
       ROUND(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0), 2) AS material_medido,
       ROUND(COALESCE(n.nf, 0), 2)                                          AS nf_alocada_no_item,
       ROUND(SUM(COALESCE(n.nf, 0)) OVER (PARTITION BY g.id), 2)            AS nf_alocada_no_grupo,
       ROUND(COALESCE(mi.nf_material_descontada, 0), 2)                     AS snapshot_gravado
  FROM medicao_itens mi
  JOIN detalhamentos d  ON d.id = mi.detalhamento_id
  JOIN tarefas t        ON t.id = d.tarefa_id
  JOIN grupos_macro g   ON g.id = t.grupo_macro_id
  LEFT JOIN nf_alocada n ON n.detalhamento_id = d.id
 WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   AND mi.quantidade_medida > 0
 ORDER BY g.ordem, d.codigo;


-- ---------------------------------------------------------------------------
-- M2 — O que o snapshot da MED-004 deveria ter, por grupo macro
--
-- Reproduz a régua acumulada (lib/db/desconto-transbordo.ts) considerando as
-- medições 1 a 3 como "já abatido" e a 004 como o período corrente.
--
-- `snapshot_atual` é o que está gravado hoje. `deveria_ser` é o desconto do
-- período pela régua. A diferença é o que está faltando — e que está sendo
-- descontado de novo na MED-005.
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)  AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)        AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
por_grupo AS (
  SELECT g.id, g.codigo AS grupo, g.nome, g.ordem,
         -- material acumulado do grupo: medições aprovadas até a 004 inclusive
         COALESCE(SUM(CASE WHEN m.numero <= 4
                           THEN mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
                      END), 0) AS material_acumulado,
         -- já abatido pelas medições ANTERIORES à 004
         COALESCE(SUM(CASE WHEN m.numero < 4
                           THEN COALESCE(mi.nf_material_descontada, 0)
                      END), 0) AS ja_abatido_antes,
         -- o que a 004 gravou (o suspeito de estar zerado)
         COALESCE(SUM(CASE WHEN m.numero = 4
                           THEN COALESCE(mi.nf_material_descontada, 0)
                      END), 0) AS snapshot_atual
    FROM grupos_macro g
    JOIN tarefas t        ON t.grupo_macro_id = g.id
    JOIN detalhamentos d  ON d.tarefa_id = t.id
    JOIN medicao_itens mi ON mi.detalhamento_id = d.id
    JOIN medicoes m       ON m.id = mi.medicao_id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
   GROUP BY g.id, g.codigo, g.nome, g.ordem
),
nf_grupo AS (
  SELECT g.id, SUM(COALESCE(n.nf, 0)) AS nf_lancada
    FROM grupos_macro g
    JOIN tarefas t ON t.grupo_macro_id = g.id
    JOIN detalhamentos d ON d.tarefa_id = t.id
    LEFT JOIN nf_alocada n ON n.detalhamento_id = d.id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   GROUP BY g.id
)
SELECT p.grupo, p.nome,
       ROUND(p.material_acumulado, 2)  AS material_acumulado,
       ROUND(f.nf_lancada, 2)          AS nf_lancada_grupo,
       ROUND(p.ja_abatido_antes, 2)    AS ja_abatido_med_1_3,
       ROUND(p.snapshot_atual, 2)      AS snapshot_atual_med_004,
       ROUND(GREATEST(LEAST(p.material_acumulado, f.nf_lancada) - p.ja_abatido_antes, 0), 2)
                                       AS deveria_ser,
       ROUND(GREATEST(LEAST(p.material_acumulado, f.nf_lancada) - p.ja_abatido_antes, 0)
             - p.snapshot_atual, 2)    AS faltando
  FROM por_grupo p
  JOIN nf_grupo f ON f.id = p.id
 WHERE p.material_acumulado > 0 OR f.nf_lancada > 0
 ORDER BY p.ordem;


-- ---------------------------------------------------------------------------
-- M3 — REPARO (ESCREVE). Rode só depois de conferir M1 e M2.
--
-- Regrava `nf_material_descontada` de TODAS as linhas medidas da MED-004
-- aplicando a régua acumulada por grupo macro: apura o desconto do período no
-- nível do grupo e distribui entre os itens proporcionalmente ao material
-- medido de cada um — exatamente o que `calcularDescontoComTransbordo` faz.
--
-- Idempotente: pode rodar mais de uma vez, o resultado é o mesmo (não depende
-- do valor atual da coluna, ao contrário do backfill da 074).
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)  AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)        AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
nf_grupo AS (
  SELECT g.id, SUM(COALESCE(n.nf, 0)) AS nf_lancada
    FROM grupos_macro g
    JOIN tarefas t ON t.grupo_macro_id = g.id
    JOIN detalhamentos d ON d.tarefa_id = t.id
    LEFT JOIN nf_alocada n ON n.detalhamento_id = d.id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   GROUP BY g.id
),
agg_grupo AS (
  SELECT g.id,
         COALESCE(SUM(CASE WHEN m.numero <= 4
                           THEN mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
                      END), 0) AS material_acumulado,
         COALESCE(SUM(CASE WHEN m.numero < 4
                           THEN COALESCE(mi.nf_material_descontada, 0)
                      END), 0) AS ja_abatido_antes,
         COALESCE(SUM(CASE WHEN m.numero = 4
                           THEN mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
                      END), 0) AS material_medido_004
    FROM grupos_macro g
    JOIN tarefas t        ON t.grupo_macro_id = g.id
    JOIN detalhamentos d  ON d.tarefa_id = t.id
    JOIN medicao_itens mi ON mi.detalhamento_id = d.id
    JOIN medicoes m       ON m.id = mi.medicao_id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
   GROUP BY g.id
),
desconto_grupo AS (
  SELECT a.id,
         a.material_medido_004,
         GREATEST(LEAST(a.material_acumulado, f.nf_lancada) - a.ja_abatido_antes, 0) AS desconto_periodo
    FROM agg_grupo a
    JOIN nf_grupo f ON f.id = a.id
),
alvo AS (
  SELECT mi.id AS medicao_item_id,
         ROUND(
           CASE WHEN dg.material_medido_004 > 0
                THEN (mi.quantidade_medida * COALESCE(d.valor_material_unit, 0))
                     / dg.material_medido_004 * dg.desconto_periodo
                ELSE 0 END
         , 2) AS valor
    FROM medicao_itens mi
    JOIN detalhamentos d  ON d.id = mi.detalhamento_id
    JOIN tarefas t        ON t.id = d.tarefa_id
    JOIN desconto_grupo dg ON dg.id = t.grupo_macro_id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
     AND mi.quantidade_medida > 0
)
UPDATE medicao_itens mi
   SET nf_material_descontada = GREATEST(a.valor, 0)
  FROM alvo a
 WHERE mi.id = a.medicao_item_id;


-- Conferência pós-reparo: total abatido pela MED-004, por grupo.
SELECT g.codigo AS grupo,
       ROUND(SUM(COALESCE(mi.nf_material_descontada, 0)), 2) AS abatido_med_004
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN tarefas t       ON t.id = d.tarefa_id
  JOIN grupos_macro g  ON g.id = t.grupo_macro_id
 WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
 GROUP BY g.codigo, g.ordem
HAVING SUM(COALESCE(mi.nf_material_descontada, 0)) > 0
 ORDER BY g.ordem;
