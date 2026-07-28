-- ---------------------------------------------------------------------------
-- 080 — Simulação da "régua acumulada" por grupo macro
--
-- SOMENTE LEITURA. Nada é alterado. Cada bloco repete seus CTEs para rodar
-- sozinho no SQL Editor do Supabase (que abre sessão nova a cada execução).
--
-- A PERGUNTA QUE ESTE SCRIPT RESPONDE:
--
-- Hoje o desconto de NF de material é apurado sobre o material medido NO
-- PERÍODO. A proposta é apurar sobre o ACUMULADO, como numa medição física:
--
--   material_acumulado   = tudo já medido de material no grupo, todas as medições
--   nf_lancada           = toda NF de material alocada ao grupo
--   desconto_acumulado   = LEAST(material_acumulado, nf_lancada)   <- a trava
--   ja_descontado        = o que as medições aprovadas anteriores abateram
--   desconto_do_periodo  = desconto_acumulado - ja_descontado
--   fip_a_lancar         = material_acumulado - desconto_acumulado
--
-- A trava do LEAST garante que não se desconte nota de material que ainda não
-- foi executado. O `fip_a_lancar` é o inverso: material executado além da nota
-- lançada — aí falta nota de verdade e a FIP precisa emitir.
--
-- Por que acumulado: a regra por período não recupera o que ficou para trás.
-- Uma nota que não descontou no mês certo (porque estava alocada no
-- detalhamento errado, sob a regra antiga item-a-item) fica perdida. No
-- acumulado ela volta sozinha, como um percentual físico lançado a menos.
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição 004: a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- H1 — A régua acumulada, grupo a grupo
--
-- Como ler:
--   desconto_periodo_novo   o que a medição 004 descontaria com a régua nova
--   fip_a_lancar            material executado sem nota — nota que falta mesmo
--   recuperado              quanto a régua traz de volta de meses anteriores
--                           (desconto_periodo_novo - material_medido_004);
--                           positivo = havia nota para trás sem descontar
--
-- Esperado: a soma de fip_a_lancar cai muito abaixo dos R$ 7.207,99 de hoje,
-- sobrando só onde a nota realmente não foi emitida (Geração, por exemplo).
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
-- Material medido acumulado: medições aprovadas + a própria 004. Mesmo
-- critério de "acumulado" que calcularInformaconData usa.
material_acum AS (
  SELECT d.id AS det_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS mat
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY d.id
),
-- Material medido só na 004, para comparar com o desconto do período.
material_004 AS (
  SELECT mi.detalhamento_id AS det_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS mat
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   GROUP BY mi.detalhamento_id
),
-- O que as medições APROVADAS já abateram (a 004 ainda não abateu nada).
ja_descontado AS (
  SELECT mi.detalhamento_id AS det_id,
         SUM(COALESCE(mi.nf_material_descontada, 0)) AS ja
    FROM medicao_itens mi
    JOIN medicoes m ON m.id = mi.medicao_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
   GROUP BY mi.detalhamento_id
),
por_grupo AS (
  SELECT g.codigo AS grupo, g.nome, g.ordem,
         COALESCE(SUM(ma.mat), 0) AS material_acumulado,
         COALESCE(SUM(n.nf),  0)  AS nf_lancada,
         COALESCE(SUM(jd.ja), 0)  AS ja_descontado,
         COALESCE(SUM(m4.mat), 0) AS material_004
    FROM grupos_macro g
    JOIN tarefas t       ON t.grupo_macro_id = g.id
    JOIN detalhamentos d ON d.tarefa_id = t.id
    LEFT JOIN nf_alocada    n  ON n.detalhamento_id = d.id
    LEFT JOIN material_acum ma ON ma.det_id = d.id
    LEFT JOIN material_004  m4 ON m4.det_id = d.id
    LEFT JOIN ja_descontado jd ON jd.det_id = d.id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   GROUP BY g.codigo, g.nome, g.ordem
)
SELECT grupo, nome,
       ROUND(material_004, 2)                                        AS material_medido_004,
       ROUND(material_acumulado, 2)                                  AS material_acumulado,
       ROUND(nf_lancada, 2)                                          AS nf_lancada,
       ROUND(ja_descontado, 2)                                       AS ja_descontado,
       ROUND(LEAST(material_acumulado, nf_lancada), 2)               AS desconto_acumulado,
       ROUND(GREATEST(LEAST(material_acumulado, nf_lancada) - ja_descontado, 0), 2)
                                                                     AS desconto_periodo_novo,
       ROUND(GREATEST(material_acumulado - LEAST(material_acumulado, nf_lancada), 0), 2)
                                                                     AS fip_a_lancar,
       ROUND(GREATEST(LEAST(material_acumulado, nf_lancada) - ja_descontado, 0) - material_004, 2)
                                                                     AS recuperado
  FROM por_grupo
 WHERE material_acumulado > 0 OR nf_lancada > 0
 ORDER BY ordem;


-- ---------------------------------------------------------------------------
-- H2 — Totais: régua nova x situação de hoje
--
-- Compare `fip_a_lancar_total` com os R$ 7.207,99 que a medição 004 mostra
-- hoje na linha "FIP a criar (NF nova)".
--
-- ATENÇÃO ao `desconto_periodo_novo_total`: ele PODE ficar acima do material
-- medido no período (R$ 420.703,43). Isso não é erro — é o acerto de contas,
-- a nota que ficou para trás nos meses 1 a 3 voltando. O que nunca pode
-- acontecer é o desconto acumulado passar do material acumulado, e o LEAST
-- garante isso grupo a grupo.
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
material_acum AS (
  SELECT d.id AS det_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS mat
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY d.id
),
material_004 AS (
  SELECT mi.detalhamento_id AS det_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS mat
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   GROUP BY mi.detalhamento_id
),
ja_descontado AS (
  SELECT mi.detalhamento_id AS det_id,
         SUM(COALESCE(mi.nf_material_descontada, 0)) AS ja
    FROM medicao_itens mi
    JOIN medicoes m ON m.id = mi.medicao_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
   GROUP BY mi.detalhamento_id
),
por_grupo AS (
  SELECT g.id,
         COALESCE(SUM(ma.mat), 0) AS material_acumulado,
         COALESCE(SUM(n.nf),  0)  AS nf_lancada,
         COALESCE(SUM(jd.ja), 0)  AS ja_descontado,
         COALESCE(SUM(m4.mat), 0) AS material_004
    FROM grupos_macro g
    JOIN tarefas t       ON t.grupo_macro_id = g.id
    JOIN detalhamentos d ON d.tarefa_id = t.id
    LEFT JOIN nf_alocada    n  ON n.detalhamento_id = d.id
    LEFT JOIN material_acum ma ON ma.det_id = d.id
    LEFT JOIN material_004  m4 ON m4.det_id = d.id
    LEFT JOIN ja_descontado jd ON jd.det_id = d.id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   GROUP BY g.id
)
SELECT ROUND(SUM(material_004), 2)                                    AS material_medido_004,
       ROUND(SUM(material_acumulado), 2)                              AS material_acumulado_total,
       ROUND(SUM(nf_lancada), 2)                                      AS nf_lancada_total,
       ROUND(SUM(ja_descontado), 2)                                   AS ja_descontado_total,
       ROUND(SUM(GREATEST(LEAST(material_acumulado, nf_lancada) - ja_descontado, 0)), 2)
                                                                      AS desconto_periodo_novo_total,
       ROUND(SUM(GREATEST(material_acumulado - LEAST(material_acumulado, nf_lancada), 0)), 2)
                                                                      AS fip_a_lancar_total
  FROM por_grupo;


-- ---------------------------------------------------------------------------
-- H3 — Onde a nota realmente falta
--
-- Só os grupos com fip_a_lancar > 0 depois da régua acumulada. Estes são os
-- únicos casos em que a FIP precisa emitir nota nova: material executado que
-- nenhuma nota cobre. Confira contra o relatório do Informakon antes de
-- aceitar — pode ser nota que existe lá e ainda não foi lançada aqui.
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
material_acum AS (
  SELECT d.id AS det_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS mat
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY d.id
)
SELECT g.codigo AS grupo, g.nome,
       ROUND(COALESCE(SUM(ma.mat), 0), 2) AS material_acumulado,
       ROUND(COALESCE(SUM(n.nf), 0), 2)   AS nf_lancada,
       ROUND(COALESCE(SUM(ma.mat), 0) - COALESCE(SUM(n.nf), 0), 2) AS falta_nota
  FROM grupos_macro g
  JOIN tarefas t       ON t.grupo_macro_id = g.id
  JOIN detalhamentos d ON d.tarefa_id = t.id
  LEFT JOIN nf_alocada    n  ON n.detalhamento_id = d.id
  LEFT JOIN material_acum ma ON ma.det_id = d.id
 WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 GROUP BY g.codigo, g.nome, g.ordem
HAVING COALESCE(SUM(ma.mat), 0) - COALESCE(SUM(n.nf), 0) > 0.01
 ORDER BY 5 DESC;
