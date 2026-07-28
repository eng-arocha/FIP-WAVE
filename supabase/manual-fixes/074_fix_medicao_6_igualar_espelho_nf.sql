-- ═══════════════════════════════════════════════════════════════════════════
-- FIX — Igualar a medição 6 ao espelho aprovado / NF emitida
--
--   contrato : aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (WAVE)
--   medição  : a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8  (nº 6, status submetido)
--
-- Divergência apurada (bloco 2 do diagnóstico) — 6 itens, e ela FECHA:
--
--   item      descrição                        % espelho   % sistema     Δ R$
--   19.1.1    ADMINISTRAÇÃO OBRA (2 meses)       11,7647   não medido  −76.000,00
--   14.2.10   SPRINKLER SOBRESOLO 3               9,9707      25,0000   + 8.418,80
--   6.1.11    QL TIPO PAV TIPO                    5,7041       8,3333   + 6.166,94
--   14.1.6    CAIXAS HIDRANTE SS4→PAV36           0,0582       1,6304   + 2.369,58
--   7.1.2     INFRA DADOS SUBSOLO 03             97,6603      98,0000   +    28,31
--   7.1.3     INFRA DADOS SUBSOLO 02             97,6603      98,0000   +    28,31
--                                                        excesso total  +17.011,94
--
--   76.000,00 − 17.011,94 = 58.988,06
--   = exatamente o gap do total (805.520,28 espelho − 746.532,22 sistema)
--
-- Os itens 4.3.11 e 16.3.11 estão medidos a 0% no sistema e ausentes no
-- espelho: impacto financeiro zero, não são tocados aqui.
--
-- As quantidades-alvo são pct_espelho × quantidade_contratada, gravadas com
-- 6 casas (migration 069). O total resultante fica em R$ 805.520,28 contra
-- R$ 805.522,67 do espelho — Δ R$ 2,39 é o arredondamento dos percentuais
-- exibidos com 4 casas, não há como eliminar.
--
-- Roda em TRANSAÇÃO com SELECT de conferência no fim.
-- Confira o resultado → COMMIT;  se estranhar → ROLLBACK;
--
-- IDEMPOTENTE: rodar de novo não faz nada (as quantidades já estarão certas
-- e o guard de igualdade impede ajuste duplicado).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $fix$
DECLARE
  v_medicao   uuid := 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8';
  v_contrato  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_motivo    text := 'Ajuste para igualar a medicao ao espelho aprovado e a NF de servico emitida (conferencia item a item de 2026-07-28).';
  v_status    text;
  v_perfil    uuid;
  v_det       uuid;
  v_unit      numeric;
  v_item      uuid;
  v_ant       numeric;
  v_novo_tot  numeric;
  r           record;
  v_upd       int := 0;
  v_ins       int := 0;
  v_skip      int := 0;
BEGIN
  -- ── Guard de status: não mexe em medição aprovada ────────────────────────
  SELECT status INTO v_status FROM medicoes WHERE id = v_medicao;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Medicao % nao encontrada.', v_medicao;
  END IF;
  IF v_status NOT IN ('rascunho', 'submetido', 'em_analise') THEN
    RAISE EXCEPTION 'Medicao esta em status "%" — desfaca a aprovacao antes de ajustar.', v_status;
  END IF;

  -- Perfil para a trilha de auditoria (medicao_item_ajustes.ajustado_por_id
  -- é NOT NULL). Se não achar, o ajuste é aplicado sem a linha de histórico.
  SELECT id INTO v_perfil FROM perfis WHERE email = 'eng.arocha@gmail.com' LIMIT 1;
  IF v_perfil IS NULL THEN
    RAISE NOTICE 'Perfil nao encontrado — ajustes serao aplicados SEM linha em medicao_item_ajustes.';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('14.2.10', 0.099707::numeric),   --  9,9707% de 1
      ('6.1.11',  2.053476::numeric),   --  5,7041% de 36
      ('14.1.6',  0.026772::numeric),   --  0,0582% de 46
      ('7.1.2',   0.976603::numeric),   -- 97,6603% de 1
      ('7.1.3',   0.976603::numeric),   -- 97,6603% de 1
      ('19.1.1',  2.000000::numeric)    --  2 de 17 meses (ADMINISTRAÇÃO OBRA)
    ) AS t(codigo, qtd_nova)
  LOOP
    -- Detalhamento pelo código dentro do contrato (bloco 4 confirmou que não
    -- há código duplicado neste contrato, então o match é único).
    SELECT d.id,
           COALESCE(d.valor_material_unit, 0) + COALESCE(d.valor_servico_unit, 0)
      INTO v_det, v_unit
      FROM detalhamentos d
      JOIN tarefas t      ON t.id = d.tarefa_id
      JOIN grupos_macro g ON g.id = t.grupo_macro_id
     WHERE g.contrato_id = v_contrato
       AND d.codigo = r.codigo;

    IF v_det IS NULL THEN
      RAISE EXCEPTION 'Detalhamento % nao encontrado no contrato.', r.codigo;
    END IF;

    SELECT id, quantidade_medida INTO v_item, v_ant
      FROM medicao_itens
     WHERE medicao_id = v_medicao AND detalhamento_id = v_det;

    IF v_item IS NULL THEN
      -- primeira vez que o item é medido nesta medição (caso do 19.1.1)
      INSERT INTO medicao_itens (medicao_id, detalhamento_id, quantidade_medida, valor_unitario)
      VALUES (v_medicao, v_det, r.qtd_nova, v_unit)
      RETURNING id INTO v_item;
      v_ant := 0;
      v_ins := v_ins + 1;
      RAISE NOTICE '% — INSERIDO com qtd %', r.codigo, r.qtd_nova;
    ELSIF ABS(v_ant - r.qtd_nova) < 1e-6 THEN
      v_skip := v_skip + 1;
      RAISE NOTICE '% — ja esta em % , nada a fazer', r.codigo, v_ant;
      CONTINUE;
    ELSE
      UPDATE medicao_itens
         SET quantidade_medida = r.qtd_nova
       WHERE id = v_item;
      v_upd := v_upd + 1;
      RAISE NOTICE '% — % → %', r.codigo, v_ant, r.qtd_nova;
    END IF;

    -- Trilha de auditoria (mesma tabela que a rota PATCH usa).
    -- Obs.: quantidade_anterior/nova são NUMERIC(15,3), então o histórico
    -- guarda o valor arredondado em 3 casas — a quantidade real em
    -- medicao_itens fica com as 6 casas.
    IF v_perfil IS NOT NULL AND ROUND(v_ant, 3) <> ROUND(r.qtd_nova, 3) THEN
      INSERT INTO medicao_item_ajustes
        (medicao_item_id, quantidade_anterior, quantidade_nova, motivo, ajustado_por_id)
      VALUES
        (v_item, ROUND(v_ant, 3), ROUND(r.qtd_nova, 3), v_motivo, v_perfil);
    END IF;
  END LOOP;

  -- ── Recalcula o snapshot medicoes.valor_total ────────────────────────────
  -- lib/db/medicoes.ts grava valor_total = Σ qtd × (mat_unit + serv_unit) na
  -- criação, mas as rotas de ajuste NÃO recalculam. Por isso o snapshot
  -- estava em 749.140,54 contra 746.532,22 real.
  SELECT COALESCE(SUM(mi.quantidade_medida
                      * (COALESCE(d.valor_material_unit, 0) + COALESCE(d.valor_servico_unit, 0))), 0)
    INTO v_novo_tot
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.medicao_id = v_medicao;

  UPDATE medicoes SET valor_total = ROUND(v_novo_tot, 2) WHERE id = v_medicao;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'inseridos: %  atualizados: %  inalterados: %', v_ins, v_upd, v_skip;
  RAISE NOTICE 'valor_total recalculado: %', ROUND(v_novo_tot, 2);
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $fix$;


-- ───────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA — compare com o rodapé do espelho antes de dar COMMIT
-- ───────────────────────────────────────────────────────────────────────────
WITH itens AS (
  SELECT
    mi.quantidade_medida * COALESCE(d.valor_material_unit, 0) AS mat,
    mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0)  AS serv
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
)
SELECT
  COUNT(*)                                                     AS qtd_itens,
  ROUND(SUM(mat), 2)                                           AS material_medido,
  ROUND(SUM(serv), 2)                                          AS servico_medido,
  ROUND(SUM(mat + serv), 2)                                    AS total_medido,
  805522.67                                                    AS espelho_total,
  ROUND(SUM(mat + serv) - 805522.67, 2)                        AS delta_vs_espelho,
  ROUND(SUM(mat + serv) * 0.05, 2)                             AS retencao_5pct,
  40276.13                                                     AS espelho_retencao,
  (SELECT valor_total FROM medicoes
    WHERE id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')         AS valor_total_gravado
FROM itens;

-- Itens tocados, para inspeção visual
SELECT
  d.codigo,
  SUBSTR(d.descricao, 1, 50)                                   AS descricao,
  mi.quantidade_medida                                         AS qtd_medida,
  d.quantidade_contratada                                      AS qtd_contratada,
  ROUND((mi.quantidade_medida / NULLIF(d.quantidade_contratada, 0) * 100)::numeric, 4)
                                                               AS pct_medido
FROM medicao_itens mi
JOIN detalhamentos d ON d.id = mi.detalhamento_id
JOIN tarefas t       ON t.id = d.tarefa_id
JOIN grupos_macro g  ON g.id = t.grupo_macro_id
WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
  AND g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND d.codigo IN ('14.2.10', '6.1.11', '14.1.6', '7.1.2', '7.1.3', '19.1.1')
ORDER BY d.codigo;

-- Confira acima. Se estiver certo:
--   COMMIT;
-- Se estranhar qualquer número:
--   ROLLBACK;
