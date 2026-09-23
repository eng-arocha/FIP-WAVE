-- ---------------------------------------------------------------------------
-- 088 — Por que os pendentes de lastro da Medição 5 não aparecem na Medição 6
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- SOMENTE LEITURA. Nenhum bloco altera dados.
--
-- O QUE DEVERIA ACONTECER
--
-- A Medição 5 cortou por falta de lastro R$ 50.291,03 no item 1.8.1 e
-- R$ 9.902,38 no 18.1.6. Esse material fica PENDENTE e deve reaparecer na
-- primeira medição seguinte, mesmo sem evolução física, como "material de
-- meses anteriores". Na tela da Medição 6 nenhum dos dois itens aparece.
--
-- O pendente é `material acumulado − já lançado em medições aprovadas`
-- (lib/db/desconto-material.ts). Ele só dá zero se `já lançado` empatar com o
-- acumulado. Há três formas de isso acontecer, e os blocos abaixo separam:
--
--   A) `medicoes.data_aprovacao` da Med 5 estar NULA. O código trata medição
--      sem data como ANTERIOR à regra e portanto liquidada — o pendente dela
--      é descartado de propósito (informacon-data.ts, `medicaoLiquidada`).
--
--   B) `medicao_itens.nf_material_descontada` da Med 5 ter sido gravada com o
--      material INTEIRO em vez do valor já cortado. Aí `já lançado` empata com
--      o acumulado e o pendente some.
--
--   C) A Med 5 não ter snapshot nenhum (tudo zero). Nesse caso o código cai
--      para "lançou o próprio material medido" — mesmo efeito.
--
-- O bloco 3 calcula o pendente exatamente como o código calcula, e é ele que
-- dá o veredito.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1) As medições do contrato: status e data de aprovação.
--    A âncora do código é 2026-08-27. Medição com `data_aprovacao` NULA ou
--    anterior a essa data é tratada como liquidada e não gera pendente.
-- ---------------------------------------------------------------------------
SELECT m.numero,
       m.status,
       m.data_aprovacao,
       CASE
         WHEN m.status <> 'aprovado'                       THEN 'nao aprovada'
         WHEN m.data_aprovacao IS NULL                     THEN 'LIQUIDADA (data nula)'
         WHEN m.data_aprovacao < '2026-08-27'::timestamptz THEN 'liquidada (anterior a regra)'
         ELSE 'gera pendente'
       END AS tratamento
  FROM medicoes m
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 ORDER BY m.numero;


-- ---------------------------------------------------------------------------
-- 2) O snapshot de desconto da Medição 5, item a item, nos dois itens que
--    foram cortados. `nf_material_descontada` tem de ser o valor CORTADO:
--    69.686,33 no 1.8.1 e 1.154,88 no 18.1.6. Se vier igual ao material
--    medido, ou zero, é a causa B ou C.
-- ---------------------------------------------------------------------------
SELECT m.numero                                              AS medicao,
       d.codigo,
       mi.quantidade_medida,
       ROUND(mi.quantidade_medida * d.valor_material_unit, 2) AS material_medido,
       mi.nf_material_descontada                             AS lancado_no_snapshot,
       ROUND(mi.quantidade_medida * d.valor_material_unit
             - COALESCE(mi.nf_material_descontada, 0), 2)    AS cortado_naquele_mes
  FROM medicao_itens mi
  JOIN medicoes m       ON m.id = mi.medicao_id
  JOIN detalhamentos d  ON d.id = mi.detalhamento_id
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND d.codigo IN ('1.8.1', '18.1.6', '1.14.1', '18.1.14')
 ORDER BY d.codigo, m.numero;


-- ---------------------------------------------------------------------------
-- 3) VEREDITO — o pendente, calculado como o código calcula.
--
--    material acumulado  = Σ (quantidade_medida × valor_material_unit) de
--                          TODAS as medições aprovadas
--    ja lancado          = Σ nf_material_descontada das medições aprovadas que
--                          NÃO são liquidadas (data_aprovacao >= 2026-08-27)
--    pendente            = max(0, acumulado − ja lancado)
--
--    O esperado é 50.291,03 no 1.8.1 e 9.902,38 no 18.1.6. Se sair zero, o
--    bloco 1 ou o 2 já mostrou por quê.
-- ---------------------------------------------------------------------------
WITH base AS (
  SELECT d.codigo,
         SUM(mi.quantidade_medida * d.valor_material_unit)                   AS mat_acumulado,
         SUM(CASE WHEN m.data_aprovacao >= '2026-08-27'::timestamptz
                  THEN COALESCE(mi.nf_material_descontada, 0)
                  ELSE mi.quantidade_medida * d.valor_material_unit END)     AS ja_lancado
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id AND m.status = 'aprovado'
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND d.codigo IN ('1.8.1', '18.1.6')
   GROUP BY d.codigo
)
SELECT codigo,
       ROUND(mat_acumulado, 2)                          AS material_acumulado,
       ROUND(ja_lancado, 2)                             AS ja_lancado,
       ROUND(GREATEST(0, mat_acumulado - ja_lancado), 2) AS pendente_de_lastro
  FROM base
 ORDER BY codigo;
