-- ═══════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (somente SELECT — não altera nada)
--
-- Compara o ESPELHO da medição final (o que foi para a NF) com o que está
-- gravado na medição do sistema:
--
--   contrato : aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (WAVE)
--   medição  : a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8
--
-- Espelho (rodapé enviado pelo usuário):
--   TOTAL SERVIÇOS MEDIDOS ............ R$ 805.522,67   (= material + serviço)
--   RETENÇÃO 5% ....................... R$  40.276,13
--   DESCONTO DE NOTAS LANÇADAS ........ R$ 424.613,03
--   LIQ A EMITIR ...................... R$ 340.631,06
--
-- As fórmulas abaixo replicam lib/db/informacon-data.ts:
--   material_medido = qtd_medida × det.valor_material_unit
--   servico_medido  = qtd_medida × det.valor_servico_unit
--   base_retencao   = material_medido + servico_medido
--   retencao        = base_retencao × contrato.percentual_retencao / 100
--   nf_descontavel  = MIN(material_medido, nf_alocada_no_item)   ← por ITEM
--   nf a emitir (tela da medição) = servico_medido − retencao
--   nf a emitir (modelo do espelho) = (mat + serv) − retencao − nf_material
--
-- Rode BLOCO POR BLOCO (1 → 4) e compare com o espelho.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — TOTAIS DA MEDIÇÃO NO SISTEMA vs RODAPÉ DO ESPELHO
-- ───────────────────────────────────────────────────────────────────────────
WITH ctx AS (
  SELECT
    m.id                                         AS medicao_id,
    m.numero,
    m.status,
    m.valor_total                                AS valor_total_gravado,
    c.id                                         AS contrato_id,
    COALESCE(c.percentual_retencao, 5)::numeric  AS pct_ret
  FROM medicoes m
  JOIN contratos c ON c.id = m.contrato_id
  WHERE m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
),
-- NF de material (fat-direto) alocada por detalhamento, rateada pelo valor do
-- item dentro do pedido — mesma lógica do informacon.
nf_por_det AS (
  SELECT
    i.detalhamento_id,
    SUM(i.valor_total / NULLIF(s.total_itens, 0) * s.total_nfs) AS nf_alocada
  FROM itens_solicitacao_fat_direto i
  JOIN (
    SELECT
      s.id,
      (SELECT COALESCE(SUM(ii.valor_total), 0)
         FROM itens_solicitacao_fat_direto ii
        WHERE ii.solicitacao_id = s.id
          AND ii.detalhamento_id IS NOT NULL)          AS total_itens,
      (SELECT COALESCE(SUM(nf.valor), 0)
         FROM notas_fiscais_fat_direto nf
        WHERE nf.solicitacao_id = s.id)                AS total_nfs
    FROM solicitacoes_fat_direto s, ctx
    WHERE s.contrato_id = ctx.contrato_id
      AND s.status = 'aprovado'
      AND s.deletado_em IS NULL
  ) s ON s.id = i.solicitacao_id
  WHERE i.detalhamento_id IS NOT NULL
  GROUP BY i.detalhamento_id
),
itens AS (
  SELECT
    mi.quantidade_medida                                          AS qtd,
    mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)     AS mat,
    mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0)      AS serv,
    COALESCE(n.nf_alocada, 0)                                     AS nf_alocada,
    LEAST(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
          COALESCE(n.nf_alocada, 0))                              AS nf_descontavel
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  LEFT JOIN nf_por_det n ON n.detalhamento_id = mi.detalhamento_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
)
SELECT
  (SELECT numero FROM ctx)                                        AS medicao,
  (SELECT status FROM ctx)                                        AS status,
  COUNT(*)                                                        AS qtd_itens,
  ROUND(SUM(mat), 2)                                              AS material_medido,
  ROUND(SUM(serv), 2)                                             AS servico_medido,
  ROUND(SUM(mat + serv), 2)                                       AS total_medido,
  ROUND(SUM(mat + serv) * (SELECT pct_ret FROM ctx) / 100, 2)     AS retencao,
  ROUND(SUM(nf_alocada), 2)                                       AS nf_material_alocada,
  ROUND(SUM(nf_descontavel), 2)                                   AS nf_material_descontavel,
  -- excedente: NF de material emitida ACIMA do material medido no item
  ROUND(SUM(nf_alocada) - SUM(nf_descontavel), 2)                 AS nf_material_excedente,
  -- fórmula da TELA da medição (tfoot): serviço − retenção
  ROUND(SUM(serv) - SUM(mat + serv) * (SELECT pct_ret FROM ctx) / 100, 2)
                                                                  AS liq_formula_sistema,
  -- fórmula do ESPELHO/NF: (mat + serv) − retenção − NF de material lançada
  ROUND(SUM(mat + serv)
        - SUM(mat + serv) * (SELECT pct_ret FROM ctx) / 100
        - SUM(nf_alocada), 2)                                     AS liq_formula_espelho,
  -- referências do espelho, para conferência lado a lado
  805522.67  AS espelho_total,
  40276.13   AS espelho_retencao,
  424613.03  AS espelho_desconto_nf,
  340631.06  AS espelho_liq_a_emitir
FROM itens;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — ITEM A ITEM: % DO ESPELHO vs % GRAVADO NO SISTEMA
-- Mostra apenas o que DIVERGE (Δ em R$ acima de 1 real) + itens que existem
-- num lado e não no outro. Se voltar VAZIO, os itens estão idênticos.
-- ───────────────────────────────────────────────────────────────────────────
WITH espelho(codigo, pct) AS (VALUES
  ('1.1.1', 90.0),      ('1.9.1', 22.0),      ('2.7.1', 68.9549),
  ('3.1.2', 98.0),      ('3.1.3', 98.0),      ('3.1.5', 10.0),
  ('3.1.7', 48.0),      ('3.1.8', 23.0),      ('3.1.11', 8.4722),
  ('3.1.15', 16.0),
  ('4.1.2', 98.0),      ('4.1.3', 98.0),      ('4.1.5', 35.0),
  ('4.1.6', 85.0),      ('4.1.7', 20.0),      ('4.1.8', 18.0),
  ('4.1.11', 8.1944),
  ('6.1.11', 5.7041),
  ('7.1.2', 97.6603),   ('7.1.3', 97.6603),   ('7.1.4', 1.2736),
  ('7.1.5', 25.0),      ('7.1.7', 50.0),      ('7.1.8', 25.0),
  ('7.1.10', 7.6389),
  ('8.1.1', 4.1667),    ('8.1.4', 90.0),      ('8.1.6', 5.0),
  ('8.1.13', 7.3986),
  ('9.1.1', 4.1667),    ('9.1.6', 5.0),       ('9.1.13', 2.5714),
  ('10.1.1', 4.1667),   ('10.1.3', 75.0),     ('10.1.12', 5.6944),
  ('10.2.1', 5.6944),
  ('14.1.1', 4.1667),   ('14.1.2', 8.0556),   ('14.1.6', 0.0582),
  ('14.2.1', 4.1667),   ('14.2.6', 50.0),     ('14.2.10', 9.9707),
  ('14.2.13', 5.5556),
  ('16.1.3', 50.0),     ('16.1.4', 50.0),     ('16.1.8', 75.0),
  ('16.1.11', 9.2029),  ('16.2.11', 2.7778),
  ('17.1.5', 2.5),      ('17.2.3', 1.3889),
  ('18.1.1', 20.0),     ('18.1.2', 20.0),     ('18.1.3', 20.0),
  ('18.1.4', 20.0),     ('18.1.5', 20.0),     ('18.1.14', 6.25),
  ('19.1.1', 11.7647)   -- ADMINISTRAÇÃO DE OBRA = 2 de 17 meses
),
sistema AS (
  SELECT
    d.codigo,
    d.descricao,
    d.quantidade_contratada                                   AS qc,
    mi.quantidade_medida                                      AS qtd_sistema,
    CASE WHEN d.quantidade_contratada > 0
         THEN mi.quantidade_medida / d.quantidade_contratada * 100 END AS pct_sistema,
    COALESCE(d.valor_material_unit, 0) + COALESCE(d.valor_servico_unit, 0) AS unit_total
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN tarefas t       ON t.id = d.tarefa_id
  JOIN grupos_macro g  ON g.id = t.grupo_macro_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
    AND g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
)
SELECT
  COALESCE(e.codigo, s.codigo)                             AS codigo,
  SUBSTR(COALESCE(s.descricao, '(não medido no sistema)'), 1, 55) AS descricao,
  e.pct                                                    AS pct_espelho,
  ROUND(s.pct_sistema::numeric, 4)                         AS pct_sistema,
  ROUND((s.pct_sistema - e.pct)::numeric, 4)               AS delta_pct,
  ROUND(((s.pct_sistema - e.pct) / 100 * s.qc * s.unit_total)::numeric, 2) AS delta_reais,
  CASE
    WHEN e.codigo IS NULL THEN 'MEDIDO NO SISTEMA, AUSENTE NO ESPELHO'
    WHEN s.codigo IS NULL THEN 'NO ESPELHO, NÃO MEDIDO NO SISTEMA'
    ELSE 'PERCENTUAL DIFERENTE'
  END                                                      AS situacao
FROM espelho e
FULL OUTER JOIN sistema s ON s.codigo = e.codigo
WHERE e.codigo IS NULL
   OR s.codigo IS NULL
   OR ABS((s.pct_sistema - e.pct) / 100 * s.qc * s.unit_total) > 1
ORDER BY 1;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — ONDE A NF DE MATERIAL ESTOURA O MATERIAL MEDIDO
-- (a causa raiz do desconto de R$ 424.613,03 não fechar com o material da
--  medição). Só aparecem itens com excedente > R$ 0,01.
-- ───────────────────────────────────────────────────────────────────────────
WITH nf_por_det AS (
  SELECT
    i.detalhamento_id,
    SUM(i.valor_total / NULLIF(s.total_itens, 0) * s.total_nfs) AS nf_alocada
  FROM itens_solicitacao_fat_direto i
  JOIN (
    SELECT
      s.id,
      (SELECT COALESCE(SUM(ii.valor_total), 0)
         FROM itens_solicitacao_fat_direto ii
        WHERE ii.solicitacao_id = s.id
          AND ii.detalhamento_id IS NOT NULL) AS total_itens,
      (SELECT COALESCE(SUM(nf.valor), 0)
         FROM notas_fiscais_fat_direto nf
        WHERE nf.solicitacao_id = s.id)       AS total_nfs
    FROM solicitacoes_fat_direto s
    WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND s.status = 'aprovado'
      AND s.deletado_em IS NULL
  ) s ON s.id = i.solicitacao_id
  WHERE i.detalhamento_id IS NOT NULL
  GROUP BY i.detalhamento_id
)
SELECT
  d.codigo,
  SUBSTR(d.descricao, 1, 55)                                        AS descricao,
  mi.quantidade_medida                                              AS qtd_medida,
  d.quantidade_contratada                                           AS qtd_contratada,
  ROUND((mi.quantidade_medida / NULLIF(d.quantidade_contratada, 0) * 100)::numeric, 4)
                                                                    AS pct_medido,
  ROUND((mi.quantidade_medida * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                                    AS material_medido,
  ROUND(COALESCE(n.nf_alocada, 0)::numeric, 2)                      AS nf_material_alocada,
  ROUND((COALESCE(n.nf_alocada, 0)
         - mi.quantidade_medida * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                                    AS excedente_nf,
  -- % que a medição precisaria ter para consumir a NF já emitida
  ROUND((COALESCE(n.nf_alocada, 0)
         / NULLIF(d.quantidade_contratada * COALESCE(d.valor_material_unit, 0), 0)
         * 100)::numeric, 4)                                        AS pct_para_zerar_excedente
FROM medicao_itens mi
JOIN detalhamentos d ON d.id = mi.detalhamento_id
LEFT JOIN nf_por_det n ON n.detalhamento_id = mi.detalhamento_id
WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
  AND COALESCE(n.nf_alocada, 0)
      - mi.quantidade_medida * COALESCE(d.valor_material_unit, 0) > 0.01
ORDER BY excedente_nf DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO 4 — SANIDADE DO CADASTRO: códigos duplicados no contrato
-- (se as migrations 047 / 063 / 071 não rodaram, 16.2.x, 17.1.x e 15.1.x
--  ficam duplicados e o % pode ter sido lançado no item errado)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  d.codigo,
  COUNT(*)                                  AS ocorrencias,
  STRING_AGG(SUBSTR(d.descricao, 1, 45), ' || ' ORDER BY d.descricao) AS descricoes
FROM detalhamentos d
JOIN tarefas t      ON t.id = d.tarefa_id
JOIN grupos_macro g ON g.id = t.grupo_macro_id
WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
GROUP BY d.codigo
HAVING COUNT(*) > 1
ORDER BY d.codigo;
