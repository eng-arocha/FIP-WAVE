-- ---------------------------------------------------------------------------
-- 089 — Reconstruir o snapshot de desconto da Medição 5
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--
-- O PROBLEMA
--
-- A aprovação da Med 5 (09/09/2026) não escreveu
-- `medicao_itens.nf_material_descontada`. Os 49 itens ficaram com o DEFAULT 0.
-- Diagnóstico confirmado: medições 1 a 4 têm snapshot (198.273,43 / 99.258,62 /
-- 206.833,91 / 423.844,53) e a 5 soma zero.
--
-- `aprovarMedicao` só grava essa coluna quando consegue recalcular o boletim;
-- falhando, omite a coluna de proposito — gravar zero seria afirmar que nada
-- foi abatido. Só que o DEFAULT 0 do banco produz exatamente essa afirmação.
--
-- O EFEITO
--
-- Com todos os valores em zero, `carregarNfJaAbatida` conclui "esta medição não
-- tem snapshot" e cai na rede de proteção: trata a Med 5 como tendo lançado o
-- próprio material medido. O pendente vira zero e os R$ 60.193,41 cortados por
-- falta de lastro somem da fila — R$ 50.291,03 do 1.8.1 e R$ 9.902,38 do
-- 18.1.6 nunca mais reapareceriam.
--
-- A RECONSTRUÇÃO
--
-- O boletim final da Med 5 é conhecido. Só dois itens foram cortados:
--     1.8.1  — material 119.977,36, lançado  69.686,33  (corte 50.291,03)
--     18.1.6 — material  11.057,26, lançado   1.154,88  (corte  9.902,38)
-- Nos demais o desconto foi o material medido inteiro.
-- Conferência: 657.540,91 − 50.291,03 − 9.902,38 = 597.347,50, que é o
-- "NF Desc." total que a tela da Med 5 exibia.
--
-- Rode os blocos NA ORDEM. O bloco 1 é a trava: sem ele fechar em 597.347,50,
-- não rode o 2.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Tem de devolver 597.347,50. Nada é alterado.
-- ===========================================================================
WITH med5 AS (
  SELECT id FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND numero = 5
)
SELECT COUNT(*) AS itens,
       ROUND(SUM(CASE d.codigo
                   WHEN '1.8.1'  THEN 69686.33
                   WHEN '18.1.6' THEN 1154.88
                   ELSE COALESCE(NULLIF(mi.valor_material_correspondente, 0),
                                 mi.quantidade_medida * d.valor_material_unit)
                 END), 2) AS total_que_sera_gravado
  FROM medicao_itens mi
  JOIN med5            ON med5.id = mi.medicao_id
  JOIN detalhamentos d ON d.id = mi.detalhamento_id;


-- ===========================================================================
-- BLOCO 2 — GRAVAÇÃO. Só depois do bloco 1 fechar em 597.347,50.
-- ===========================================================================
BEGIN;

WITH med5 AS (
  SELECT id FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND numero = 5
)
UPDATE medicao_itens mi
   SET nf_material_descontada = ROUND(CASE d.codigo
         WHEN '1.8.1'  THEN 69686.33
         WHEN '18.1.6' THEN 1154.88
         ELSE COALESCE(NULLIF(mi.valor_material_correspondente, 0),
                       mi.quantidade_medida * d.valor_material_unit)
       END, 2)
  FROM detalhamentos d, med5
 WHERE d.id = mi.detalhamento_id
   AND mi.medicao_id = med5.id;

COMMIT;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA. Tem de devolver 597.347,50 na Med 5.
-- ===========================================================================
SELECT m.numero,
       ROUND(COALESCE(SUM(mi.nf_material_descontada), 0), 2) AS soma_snapshot
  FROM medicao_itens mi
  JOIN medicoes m ON m.id = mi.medicao_id
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 GROUP BY m.numero
 ORDER BY m.numero;


-- ===========================================================================
-- BLOCO 4 — O PENDENTE VOLTOU? Esperado: 50.291,03 e 9.902,38.
-- ===========================================================================
WITH base AS (
  SELECT d.codigo,
         SUM(COALESCE(NULLIF(mi.valor_material_correspondente, 0),
                      mi.quantidade_medida * d.valor_material_unit)) AS mat_acumulado,
         SUM(COALESCE(mi.nf_material_descontada, 0))                 AS ja_lancado
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id AND m.status = 'aprovado'
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND d.codigo IN ('1.8.1', '18.1.6')
   GROUP BY d.codigo
)
SELECT codigo,
       ROUND(mat_acumulado, 2)                           AS material_acumulado,
       ROUND(ja_lancado, 2)                              AS ja_lancado,
       ROUND(GREATEST(0, mat_acumulado - ja_lancado), 2) AS pendente_de_lastro
  FROM base
 ORDER BY codigo;


-- ===========================================================================
-- BLOCO 5 — OPCIONAL, item a item, se quiser auditar antes de gravar.
-- ===========================================================================
WITH med5 AS (
  SELECT id FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND numero = 5
)
SELECT d.codigo,
       ROUND(COALESCE(NULLIF(mi.valor_material_correspondente, 0),
                      mi.quantidade_medida * d.valor_material_unit), 2) AS material_medido,
       ROUND(CASE d.codigo
               WHEN '1.8.1'  THEN 69686.33
               WHEN '18.1.6' THEN 1154.88
               ELSE COALESCE(NULLIF(mi.valor_material_correspondente, 0),
                             mi.quantidade_medida * d.valor_material_unit)
             END, 2)                                                    AS vai_gravar
  FROM medicao_itens mi
  JOIN med5            ON med5.id = mi.medicao_id
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
 ORDER BY d.codigo;
