-- Migration 063 — Corrige codigo da tarefa "CAIXAS, REGULADORES E VALVULAS"
-- e seus detalhamentos no grupo 17 (GAS).
--
-- Bug: o seed do orcamento (041_reseed_orcamento_wave.sql) gravou a
-- segunda tarefa do grupo 17 com codigo='17.1' (igual a TUBOS E CONEXOES)
-- e seus detalhamentos com prefixo '17.1.X' (chocando 17.1.1..17.1.5 com
-- os 17.1.1..17.1.7 da tarefa de TUBOS). Resultado: na UI da Estrutura do
-- Contrato so uma tarefa aparece, com itens misturados, e qualquer
-- agrupamento por codigo (limites de fat-direto/medicao) gera ambiguidade.
--
-- Fix: renomeia codigo da segunda tarefa de '17.1' para '17.2' e seus
-- detalhamentos de '17.1.X' para '17.2.X'. As FKs (medicao_itens etc.)
-- usam id, nao codigo, entao nao precisam ser tocadas.
--
-- Idempotente: roda em qualquer contrato que ainda tenha o bug; ignora
-- contratos onde a estrutura ja esta correta.

DO $mig$
DECLARE
  r RECORD;
  v_count_tarefas INT := 0;
  v_count_detalhamentos INT := 0;
BEGIN
  FOR r IN
    SELECT t.id AS tarefa_id, g.contrato_id
    FROM tarefas t
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
    WHERE g.codigo = '17'
      AND t.codigo = '17.1'
      AND t.nome ILIKE '%CAIXAS%'
  LOOP
    -- Detalhamentos: '17.1.X' -> '17.2.X'
    WITH upd AS (
      UPDATE detalhamentos
      SET codigo = '17.2' || SUBSTRING(codigo FROM 5)
      WHERE tarefa_id = r.tarefa_id
        AND codigo LIKE '17.1.%'
      RETURNING 1
    )
    SELECT COUNT(*) INTO v_count_detalhamentos FROM upd;

    -- Tarefa: '17.1' -> '17.2'
    UPDATE tarefas SET codigo = '17.2' WHERE id = r.tarefa_id;
    v_count_tarefas := v_count_tarefas + 1;

    RAISE NOTICE 'Migration 063: contrato % — tarefa % corrigida (% detalhamentos renomeados de 17.1.X para 17.2.X)',
      r.contrato_id, r.tarefa_id, v_count_detalhamentos;
  END LOOP;

  IF v_count_tarefas = 0 THEN
    RAISE NOTICE 'Migration 063: nenhuma tarefa CAIXAS com codigo=17.1 encontrada (estrutura ja correta ou contrato sem grupo 17)';
  ELSE
    RAISE NOTICE 'Migration 063: % tarefa(s) corrigida(s)', v_count_tarefas;
  END IF;
END;
$mig$;
