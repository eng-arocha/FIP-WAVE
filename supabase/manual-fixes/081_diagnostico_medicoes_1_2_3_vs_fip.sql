-- ---------------------------------------------------------------------------
-- 081 — MED-001, MED-002 e MED-003 batem com o espelho da FIP?
--
-- SOMENTE LEITURA. Nada é alterado.
--
-- CONTEXTO: ao comparar o boletim das medições 1, 2 e 3 com a tabela oficial
-- da FIP, o usuário encontrou divergência nos 3 casos. A dúvida é se isso foi
-- causado pelas mudanças de hoje (régua acumulada, transbordo do pedido
-- aprovado) ou se já existia.
--
-- J1 responde isso: compara o que foi CONGELADO na aprovação (colunas
-- gravadas por `aprovarMedicao` em lib/db/medicoes.ts, que nunca mais mudam
-- depois de aprovada) contra o que o boletim RECALCULA ao vivo hoje.
--
--   drift_material = 0  → nada mudou desde a aprovação. A divergência contra
--                         a FIP já existia quando a medição foi aprovada —
--                         não é causada por nenhuma mudança de código de hoje.
--   drift_material ≠ 0  → alguma coisa moveu depois da aprovação (preço
--                         unitário de detalhamento editado, ou outro dado
--                         usado no cálculo). Precisa investigar caso a caso.
--
-- J2 mostra a divergência final contra a tabela que a FIP enviou, pra
-- dimensionar o que precisaria de um ajuste de rateio (como o da 004).
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- J1 — Congelado na aprovação x recalculado ao vivo hoje
-- ---------------------------------------------------------------------------
WITH live AS (
  SELECT m.id, m.numero,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_live,
         SUM(mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0))  AS servico_live
    FROM medicoes m
    JOIN medicao_itens mi ON mi.medicao_id = m.id
    JOIN detalhamentos d  ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.numero IN (1, 2, 3)
   GROUP BY m.id, m.numero
)
SELECT m.numero,
       ROUND(m.valor_material_correspondente, 2)                              AS material_congelado,
       ROUND(live.material_live, 2)                                           AS material_ao_vivo,
       ROUND(COALESCE(live.material_live, 0) - COALESCE(m.valor_material_correspondente, 0), 2)
                                                                               AS drift_material,
       ROUND(m.valor_total - COALESCE(m.valor_material_correspondente, 0), 2) AS servico_congelado,
       ROUND(live.servico_live, 2)                                            AS servico_ao_vivo,
       ROUND(COALESCE(live.servico_live, 0) - (m.valor_total - COALESCE(m.valor_material_correspondente, 0)), 2)
                                                                               AS drift_servico,
       ROUND(m.valor_retencao_garantia, 2)                                    AS retencao_congelada,
       m.data_aprovacao
  FROM medicoes m
  LEFT JOIN live ON live.id = m.id
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND m.numero IN (1, 2, 3)
 ORDER BY m.numero;


-- ---------------------------------------------------------------------------
-- J2 — Congelado (nossa aprovação) x tabela oficial enviada pela FIP
--
-- Valores da FIP hardcoded a partir da tabela colada no chat em 28/07/2026.
-- ajuste_para_bater = quanto precisaria entrar em `ajuste_material_anterior`
-- pra o líquido bater com a FIP — POSITIVO subtrai (nosso serviço é maior),
-- NEGATIVO soma de volta (nosso serviço é menor). Só faz sentido aplicar como
-- ajuste de RATEIO se `total_fip` ≈ `total_congelado` (mesma base medida,
-- só a divisão material/serviço difere) — quando os totais também divergem,
-- é uma questão de quantidade/preço, não de rateio, e não deve ser mascarada
-- num ajuste.
-- ---------------------------------------------------------------------------
WITH fip AS (
  SELECT * FROM (VALUES
    (1, 337748.98, 198483.41, 139265.57, 16887.45, 122377.44),
    (2, 166958.80,  97532.80,  69426.00,  8347.94,  61076.96),
    (3, 500644.83, 207739.56, 292905.27, 25032.24, 267873.72),
    (4, 805522.67, 424613.03, 380909.64, 40276.13, 340631.06)
  ) AS t(numero, total_fip, material_fip, servico_fip, retencao_fip, liquido_fip)
),
nosso AS (
  SELECT m.numero,
         m.valor_total                                                    AS total_congelado,
         m.valor_material_correspondente                                  AS material_congelado,
         m.valor_total - COALESCE(m.valor_material_correspondente, 0)     AS servico_congelado,
         m.valor_retencao_garantia                                        AS retencao_congelada,
         COALESCE(m.ajuste_material_anterior, 0)                          AS ajuste_atual
    FROM medicoes m
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.numero IN (1, 2, 3, 4)
)
SELECT fip.numero,
       ROUND(nosso.total_congelado, 2)                          AS total_nosso,
       ROUND(fip.total_fip, 2)                                  AS total_fip,
       ROUND(nosso.total_congelado - fip.total_fip, 2)          AS diff_total,
       ROUND(nosso.material_congelado, 2)                       AS material_nosso,
       ROUND(fip.material_fip, 2)                               AS material_fip,
       ROUND(nosso.servico_congelado, 2)                        AS servico_nosso,
       ROUND(fip.servico_fip, 2)                                AS servico_fip,
       ROUND(nosso.servico_congelado - fip.servico_fip, 2)      AS ajuste_para_bater,
       ROUND(nosso.ajuste_atual, 2)                             AS ajuste_ja_aplicado,
       ROUND(nosso.retencao_congelada - fip.retencao_fip, 2)    AS diff_retencao,
       CASE
         WHEN ABS(nosso.total_congelado - fip.total_fip) <= 3.00
           THEN 'rateio: mesmo total, só a divisão material/serviço difere'
         ELSE 'ATENÇÃO: total também diverge — não é só rateio, investigar quantidade/preço'
       END AS diagnostico
  FROM fip
  JOIN nosso ON nosso.numero = fip.numero
 ORDER BY fip.numero;
