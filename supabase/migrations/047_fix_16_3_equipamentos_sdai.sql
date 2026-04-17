-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 047 — FIX 16.2.x duplicado na tarefa 16.3 EQUIPAMENTOS SDAI
--
-- Bug: o seed original gravou os detalhamentos da tarefa 16.3 (EQUIPAMENTOS
-- SDAI) com códigos 16.2.1..16.2.14 em vez de 16.3.1..16.3.14.
-- Como a tarefa 16.2 (CABEAMENTO) também tem dets 16.2.x, o app mostra
-- duplicatas.
--
-- Correção: renomear codigo de '16.2.X' → '16.3.X' para todos os dets da
-- tarefa 16.3 cuja descricao começa com 'EQUIPAMENTOS SDAI' (padrão oficial
-- do Excel com 14 linhas).
--
-- Idempotente: só atualiza linhas que ainda têm o código errado.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_contrato uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_grupo_16_id uuid;
  v_tarefa_16_3_id uuid;
  v_renomeados int := 0;
  v_total_acao int;
BEGIN
  SELECT id INTO v_grupo_16_id
    FROM grupos_macro
   WHERE contrato_id = v_contrato AND codigo = '16';
  IF v_grupo_16_id IS NULL THEN
    RAISE NOTICE 'Grupo 16 não existe no contrato — nada a fazer';
    RETURN;
  END IF;

  SELECT id INTO v_tarefa_16_3_id
    FROM tarefas
   WHERE grupo_macro_id = v_grupo_16_id AND codigo = '16.3';
  IF v_tarefa_16_3_id IS NULL THEN
    RAISE NOTICE 'Tarefa 16.3 não existe — nada a fazer';
    RETURN;
  END IF;

  -- Renomeia 16.2.X → 16.3.X para dets desta tarefa cuja descricao é
  -- 'EQUIPAMENTOS SDAI%' (ou similar com espaço à frente / após)
  UPDATE detalhamentos
     SET codigo = REPLACE(codigo, '16.2.', '16.3.')
   WHERE tarefa_id = v_tarefa_16_3_id
     AND codigo ~ '^16\.2\.\d+$'
     AND (
       UPPER(TRIM(descricao)) LIKE 'EQUIPAMENTOS SDAI%'
       OR UPPER(TRIM(descricao)) LIKE 'EQUIPAMENTOS  SDAI%'  -- alguns seeds têm 2 espaços
     );
  GET DIAGNOSTICS v_total_acao = ROW_COUNT;
  v_renomeados := v_renomeados + v_total_acao;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'FIX 16.3 EQUIPAMENTOS SDAI CONCLUÍDO';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Detalhamentos renomeados: %', v_renomeados;
END $$;

-- Conferência
SELECT d.codigo, SUBSTR(d.descricao, 1, 50) AS descricao
  FROM detalhamentos d
  JOIN tarefas t ON t.id = d.tarefa_id
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
 WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND t.codigo = '16.3'
 ORDER BY d.ordem, d.codigo;

COMMIT;
