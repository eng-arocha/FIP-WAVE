-- ---------------------------------------------------------------------------
-- 101 — Remove tarefas-fantasma duplicadas do orçamento (ex.: três "1.6")
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Diagnóstico: docs/DIVIDAS.md ("Tarefas duplicadas no orçamento").
--
-- Seeds antigos (005/011/015) gravaram a mesma tarefa mais de uma vez. No
-- grupo 1 há a 1.6 real (com detalhamentos) e duas cópias vazias
-- ("Tranformadores"), cada uma com cabeçalho de R$ 159.374,24. A Visão Geral
-- já as ignora (lib/db/dashboard.ts); a aba Estrutura ainda as mostra.
--
-- FANTASMA = tarefa SEM detalhamentos cujo código (sem ponto final) é igual
-- ao de uma tarefa irmã (mesmo grupo) que TEM detalhamentos.
--
-- SEGURANÇA: só a tabela `detalhamentos` tem FK declarada para `tarefas`;
-- outras guardam `tarefa_id` sem FK. O bloco 2 varre TODA coluna `tarefa_id`
-- do schema public e recusa se qualquer fantasma estiver referenciada.
--
-- Rode os blocos NA ORDEM.
-- ---------------------------------------------------------------------------


-- BLOCO 1 — PRÉVIA. Esperado: 2 linhas (1.6 "Tranformadores"), dets = 0.
SELECT t.id, t.codigo, t.nome, t.valor_total, g.codigo AS grupo
  FROM tarefas t
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
 WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND NOT EXISTS (SELECT 1 FROM detalhamentos d WHERE d.tarefa_id = t.id)
   AND EXISTS (
     SELECT 1 FROM tarefas t2
      WHERE t2.grupo_macro_id = t.grupo_macro_id AND t2.id <> t.id
        AND rtrim(trim(t2.codigo), '.') = rtrim(trim(t.codigo), '.')
        AND EXISTS (SELECT 1 FROM detalhamentos d2 WHERE d2.tarefa_id = t2.id))
 ORDER BY t.codigo;


-- BLOCO 2 — REMOÇÃO (transação única; recusa se houver qualquer referência)
DO $$
DECLARE
  v_ids  uuid[];
  col    record;
  v_refs bigint;
BEGIN
  SELECT array_agg(t.id) INTO v_ids
    FROM tarefas t
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND NOT EXISTS (SELECT 1 FROM detalhamentos d WHERE d.tarefa_id = t.id)
     AND EXISTS (
       SELECT 1 FROM tarefas t2
        WHERE t2.grupo_macro_id = t.grupo_macro_id AND t2.id <> t.id
          AND rtrim(trim(t2.codigo), '.') = rtrim(trim(t.codigo), '.')
          AND EXISTS (SELECT 1 FROM detalhamentos d2 WHERE d2.tarefa_id = t2.id));

  IF v_ids IS NULL THEN RAISE NOTICE 'Nenhuma tarefa-fantasma.'; RETURN; END IF;
  IF array_length(v_ids, 1) > 5 THEN
    RAISE EXCEPTION 'Mais fantasmas que o esperado (%): revisar o bloco 1.', array_length(v_ids, 1);
  END IF;

  FOR col IN
    SELECT table_name FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name = 'tarefa_id' AND table_name <> 'tarefas'
       AND table_name IN (SELECT table_name FROM information_schema.tables
                           WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tarefa_id = ANY($1)', col.table_name)
      INTO v_refs USING v_ids;
    IF v_refs > 0 THEN
      RAISE EXCEPTION 'Tarefa-fantasma referenciada em % (% linhas) — não removida.', col.table_name, v_refs;
    END IF;
  END LOOP;

  DELETE FROM tarefas WHERE id = ANY(v_ids);
  RAISE NOTICE 'OK: % tarefa(s)-fantasma removida(s).', array_length(v_ids, 1);
END $$;


-- BLOCO 3 — CONFERÊNCIA. Esperado: 0 linhas (rode de novo o bloco 1).
