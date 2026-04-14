-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 043 — MERGE DEFINITIVO das duplicatas do orçamento WAVE
--
-- Situação: 2 versões coexistem no banco
--   VELHOS (created_at < 2026-04-14 12:00): codigo com ".0" (ex: "1.0"), valor errado, TÊM FK
--   NOVOS  (created_at > 2026-04-14 12:00): codigo sem ".0" (ex: "1"), valor correto, SEM FK
--
-- Estratégia: copia valores dos NOVOS pros VELHOS (matching por codigo normalizado)
--             depois deleta os NOVOS (sem FK, sem efeito colateral)
--             depois normaliza codigos dos VELHOS (tira ".0")
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- Timestamp de corte: tudo criado depois disso é "NOVO"
-- (você rodou o 041 às 23:16 hoje)
DO $$
DECLARE
  v_contrato uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_cutoff timestamptz := '2026-04-14 12:00:00+00';
  v_gr_upd int; v_tf_upd int; v_dt_upd int;
  v_gr_del int; v_tf_del int; v_dt_del int;
BEGIN

  -- ── 1. Copia valores GRUPOS (novo → velho, matching por codigo normalizado) ──
  WITH atualiza AS (
    UPDATE grupos_macro g_velho
    SET valor_material   = g_novo.valor_material,
        valor_servico    = g_novo.valor_servico,
        valor_contratado = g_novo.valor_material + g_novo.valor_servico,
        nome             = g_novo.nome,
        disciplina       = COALESCE(g_novo.disciplina, g_velho.disciplina),
        ordem            = g_novo.ordem
    FROM grupos_macro g_novo
    WHERE g_velho.contrato_id = v_contrato
      AND g_novo.contrato_id  = v_contrato
      AND g_velho.created_at  < v_cutoff
      AND g_novo.created_at   >= v_cutoff
      AND regexp_replace(g_velho.codigo, '\.0+$', '') = g_novo.codigo
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_gr_upd FROM atualiza;

  -- ── 2. Copia valores TAREFAS ──
  WITH atualiza AS (
    UPDATE tarefas t_velho
    SET valor_unitario        = t_novo.valor_unitario,
        valor_total           = t_novo.valor_total,
        quantidade_contratada = t_novo.quantidade_contratada,
        nome                  = t_novo.nome,
        disciplina            = COALESCE(t_novo.disciplina, t_velho.disciplina),
        local                 = COALESCE(t_novo.local, t_velho.local),
        ordem                 = t_novo.ordem
    FROM tarefas t_novo
    JOIN grupos_macro g_novo  ON g_novo.id = t_novo.grupo_macro_id
    JOIN grupos_macro g_velho ON g_velho.id = t_velho.grupo_macro_id
    WHERE g_novo.contrato_id  = v_contrato
      AND g_velho.contrato_id = v_contrato
      AND g_novo.created_at   >= v_cutoff
      AND g_velho.created_at  < v_cutoff
      AND regexp_replace(t_velho.codigo, '\.0+$', '') = t_novo.codigo
      AND regexp_replace(g_velho.codigo, '\.0+$', '') = g_novo.codigo
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_tf_upd FROM atualiza;

  -- ── 3. Copia valores DETALHAMENTOS ──
  WITH atualiza AS (
    UPDATE detalhamentos d_velho
    SET valor_material_unit   = d_novo.valor_material_unit,
        valor_servico_unit    = d_novo.valor_servico_unit,
        valor_unitario        = d_novo.valor_unitario,
        quantidade_contratada = d_novo.quantidade_contratada,
        descricao             = d_novo.descricao,
        unidade               = d_novo.unidade,
        disciplina            = COALESCE(d_novo.disciplina, d_velho.disciplina),
        local                 = COALESCE(d_novo.local, d_velho.local),
        ordem                 = d_novo.ordem
    FROM detalhamentos d_novo
    JOIN tarefas t_novo       ON t_novo.id = d_novo.tarefa_id
    JOIN grupos_macro g_novo  ON g_novo.id = t_novo.grupo_macro_id
    JOIN tarefas t_velho      ON t_velho.id = d_velho.tarefa_id
    JOIN grupos_macro g_velho ON g_velho.id = t_velho.grupo_macro_id
    WHERE g_novo.contrato_id  = v_contrato
      AND g_velho.contrato_id = v_contrato
      AND g_novo.created_at   >= v_cutoff
      AND g_velho.created_at  < v_cutoff
      AND regexp_replace(d_velho.codigo, '\.0+$', '') = d_novo.codigo
      AND regexp_replace(t_velho.codigo, '\.0+$', '') = t_novo.codigo
      AND regexp_replace(g_velho.codigo, '\.0+$', '') = g_novo.codigo
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dt_upd FROM atualiza;

  -- ── 4. DELETE dos NOVOS (agora que os valores já foram copiados) ──
  WITH del AS (
    DELETE FROM detalhamentos
    WHERE tarefa_id IN (
      SELECT t.id FROM tarefas t
      JOIN grupos_macro g ON g.id = t.grupo_macro_id
      WHERE g.contrato_id = v_contrato AND g.created_at >= v_cutoff
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dt_del FROM del;

  WITH del AS (
    DELETE FROM tarefas
    WHERE grupo_macro_id IN (
      SELECT id FROM grupos_macro
      WHERE contrato_id = v_contrato AND created_at >= v_cutoff
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_tf_del FROM del;

  WITH del AS (
    DELETE FROM grupos_macro
    WHERE contrato_id = v_contrato AND created_at >= v_cutoff
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_gr_del FROM del;

  -- ── 5. NORMALIZA codigos dos VELHOS (tira ".0" do final) ──
  UPDATE grupos_macro
  SET codigo = regexp_replace(codigo, '\.0+$', '')
  WHERE contrato_id = v_contrato AND codigo ~ '\.0+$';

  UPDATE tarefas
  SET codigo = regexp_replace(codigo, '\.0+$', '')
  WHERE grupo_macro_id IN (SELECT id FROM grupos_macro WHERE contrato_id = v_contrato)
    AND codigo ~ '\.0+$';

  UPDATE detalhamentos
  SET codigo = regexp_replace(codigo, '\.0+$', '')
  WHERE tarefa_id IN (
    SELECT t.id FROM tarefas t
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
    WHERE g.contrato_id = v_contrato
  )
  AND codigo ~ '\.0+$';

  -- ── RELATÓRIO ──
  RAISE NOTICE '';
  RAISE NOTICE '═════════════════════════════════════════════════════════';
  RAISE NOTICE 'MERGE CONCLUÍDO';
  RAISE NOTICE '═════════════════════════════════════════════════════════';
  RAISE NOTICE 'Valores copiados: % grupos, % tarefas, % detalhamentos', v_gr_upd, v_tf_upd, v_dt_upd;
  RAISE NOTICE 'Duplicatas deletadas: % grupos, % tarefas, % detalhamentos', v_gr_del, v_tf_del, v_dt_del;
  RAISE NOTICE '';
END $$;

-- ── CONFERÊNCIA ──
SELECT
  (SELECT COUNT(*) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS grupos,
  (SELECT COUNT(*) FROM tarefas t JOIN grupos_macro g ON g.id = t.grupo_macro_id WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS tarefas,
  (SELECT COUNT(*) FROM detalhamentos d JOIN tarefas t ON t.id = d.tarefa_id JOIN grupos_macro g ON g.id = t.grupo_macro_id WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS detalhamentos,
  ROUND((SELECT SUM(valor_material) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2) AS total_material,
  ROUND((SELECT SUM(valor_servico) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2) AS total_mo;

SELECT d.codigo, d.quantidade_contratada, d.valor_material_unit, d.subtotal_material
FROM detalhamentos d
JOIN tarefas t ON t.id = d.tarefa_id
JOIN grupos_macro g ON g.id = t.grupo_macro_id
WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND d.codigo = '8.1.1';

-- ═════════════════════════════════════════════════════════════════════════
-- SE OS RESULTADOS MOSTRAREM:
--   grupos=18  total_material≈11,300,000  total_mo≈6,700,000
--   8.1.1: qtde=48, valor=5907.79, subtotal=283,573.92
-- → faça: COMMIT;
--
-- QUALQUER OUTRA COISA → ROLLBACK;
-- ═════════════════════════════════════════════════════════════════════════
