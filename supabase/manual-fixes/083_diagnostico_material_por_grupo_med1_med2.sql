-- ---------------------------------------------------------------------------
-- 083 — Onde exatamente MED-001 e MED-002 divergem da FIP, grupo a grupo
--
-- SOMENTE LEITURA. Nada é alterado.
--
-- CONTEXTO: o usuário mandou o detalhe completo de NFs que compõem o
-- "Material Fornecido" da FIP pras medições 1 e 2 (relatório Informakon).
-- Somando essas NFs por grupo macro (conferido: bate 198.483,41 e 97.532,80
-- com a FIP, ao centavo), dá pra comparar contra o que o NOSSO sistema tem
-- de material medido por grupo NESSAS DUAS medições — e achar exatamente
-- onde a diferença mora, em vez de brigar com o total agregado.
--
-- Resultado esperado: se a diferença aparecer concentrada num grupo só (ou
-- pouquíssimos), é a mesma classe de problema já visto na 004 (rateio ou
-- detalhamento mal mapeado). Se aparecer espalhada e pequena em vários
-- grupos, é resíduo de arredondamento dos percentuais digitados no espelho
-- (mesmo fenômeno da 004: 805.522,67 vs 805.520,27 = R$ 2,40 de resíduo).
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- ---------------------------------------------------------------------------

WITH fip AS (
  -- Grupo macro somado a partir do detalhe de NF que o usuário colou no
  -- chat em 28/07/2026 (conferido: soma bate 198.483,41 e 97.532,80).
  SELECT * FROM (VALUES
    (1, 1, '1',    5261.84),
    (1, 2, '2',   19367.62),
    (1, 4, '4',    1591.77),
    (1, 7, '7',    1060.07),
    (1, 8, '8',   22805.10),
    (1, 9, '9',   26159.32),
    (1, 18,'18',  46237.69),
    (1, 19,'19',  76000.00),
    (2, 3, '3',    5155.52),
    (2, 4, '4',    2706.00),
    (2, 9, '9',    6539.83),
    (2, 18,'18',   3693.55),
    (2, 8, '8',    1249.50),
    (2, 10,'10',  28253.70),
    (2, 19,'19',  49934.70)
  ) AS t(numero, ordem, grupo, material_fip)
),
-- "ADMINISTRAÇÃO OBRA" é o detalhamento 19.1.1, mas pertence ao grupo macro
-- 19 (SERVIÇOS COMPLEMENTARES) — conferido no diagnóstico 080 (H1), onde o
-- material_medido_004 do grupo 19 bateu exatamente com o total de
-- administração daquele período.
nosso AS (
  SELECT m.numero,
         g.codigo AS grupo,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_nosso
    FROM medicoes m
    JOIN medicao_itens mi  ON mi.medicao_id = m.id
    JOIN detalhamentos d   ON d.id = mi.detalhamento_id
    JOIN tarefas t         ON t.id = d.tarefa_id
    JOIN grupos_macro g    ON g.id = t.grupo_macro_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.numero IN (1, 2)
   GROUP BY m.numero, g.codigo
)
SELECT fip.numero,
       fip.grupo,
       ROUND(fip.material_fip, 2)                              AS material_fip,
       ROUND(COALESCE(nosso.material_nosso, 0), 2)             AS material_nosso,
       ROUND(COALESCE(nosso.material_nosso, 0) - fip.material_fip, 2) AS diferenca
  FROM fip
  LEFT JOIN nosso ON nosso.numero = fip.numero AND nosso.grupo = fip.grupo
 ORDER BY fip.numero, ABS(COALESCE(nosso.material_nosso, 0) - fip.material_fip) DESC;


-- ---------------------------------------------------------------------------
-- L2 — Drill-down item a item, pra abrir o(s) grupo(s) que o L1 apontar
--
-- Mostra quantidade medida, % medido e o material resultante de CADA
-- detalhamento tocado em MED-001/MED-002, com o grupo macro ao lado — depois
-- de ver no L1 qual grupo diverge, filtre esta lista por ele (ou rode com o
-- olho na coluna `grupo`) pra achar o item específico com a % ou o
-- valor_material_unit fora do esperado.
-- ---------------------------------------------------------------------------
SELECT m.numero,
       g.codigo                                                AS grupo,
       d.codigo, d.descricao,
       mi.quantidade_medida,
       ROUND(d.quantidade_contratada, 4)                        AS quantidade_contratada,
       ROUND(CASE WHEN d.quantidade_contratada > 0
                  THEN mi.quantidade_medida / d.quantidade_contratada * 100
                  ELSE 0 END, 4)                                AS pct_medido,
       ROUND(d.valor_material_unit, 2)                          AS valor_material_unit,
       ROUND(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0), 2) AS material_medido
  FROM medicoes m
  JOIN medicao_itens mi  ON mi.medicao_id = m.id
  JOIN detalhamentos d   ON d.id = mi.detalhamento_id
  JOIN tarefas t         ON t.id = d.tarefa_id
  JOIN grupos_macro g    ON g.id = t.grupo_macro_id
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND m.numero IN (1, 2)
   AND mi.quantidade_medida > 0
 ORDER BY m.numero, g.ordem, d.codigo;
