-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 045 — FIX 12.1.1 TRIPLICADO (renomear pra 12.1.2 e 12.1.3)
--
-- Na planilha oficial tem 3 detalhamentos com codigo=12.1.1 (erro de parsing).
-- Correção oficial do usuário:
--   12.1.1 TUBOS E CONEXÕES (PVC SOLDAVEL E PPR)        — mantém
--   12.1.1 ACABAMENTOS (RALOS, ASPIRAÇÃO, RETORNO)      → 12.1.2
--   12.1.1 BARRILHETES E BOMBAS                         → 12.1.3
--
-- Este script é IDEMPOTENTE:
--   - Se tem 3 detalhamentos → renomeia 2 deles
--   - Se tem só 1 (após dedup) → INSERE os outros 2
--   - Se já está correto → não faz nada
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_contrato uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_tarefa_12_1_id uuid;
  v_grupo_12_id uuid;
  v_acao text;
  v_renamed int := 0;
  v_inserted int := 0;
BEGIN
  -- 1. Garante que o grupo 12 existe
  SELECT id INTO v_grupo_12_id
  FROM grupos_macro
  WHERE contrato_id = v_contrato AND codigo = '12';
  IF v_grupo_12_id IS NULL THEN
    RAISE EXCEPTION 'Grupo 12 não existe no contrato %', v_contrato;
  END IF;

  -- 2. Garante que a tarefa 12.1 existe (cria se faltar)
  SELECT id INTO v_tarefa_12_1_id
  FROM tarefas
  WHERE grupo_macro_id = v_grupo_12_id AND codigo = '12.1';

  IF v_tarefa_12_1_id IS NULL THEN
    INSERT INTO tarefas (
      grupo_macro_id, codigo, nome, disciplina, local,
      quantidade_contratada, valor_unitario, valor_total, ordem
    ) VALUES (
      v_grupo_12_id, '12.1', 'HIDRAULICA - PISCINA E SPA', 'HIDRAULICA', 'TORRE',
      1, 128774.75, 128774.75, 1
    )
    RETURNING id INTO v_tarefa_12_1_id;
    RAISE NOTICE 'Tarefa 12.1 criada (id=%)', v_tarefa_12_1_id;
  END IF;

  -- 3. Renomeia o detalhamento ACABAMENTOS (12.1.1 → 12.1.2)
  --    Procura por descricao contendo 'ACABAMENTOS' E 'RALOS'
  UPDATE detalhamentos
  SET codigo = '12.1.2', ordem = 2
  WHERE tarefa_id = v_tarefa_12_1_id
    AND codigo = '12.1.1'
    AND descricao ILIKE '%ACABAMENTOS%'
    AND descricao ILIKE '%RALOS%';
  GET DIAGNOSTICS v_acao = ROW_COUNT;
  IF v_acao::int > 0 THEN
    v_renamed := v_renamed + v_acao::int;
    RAISE NOTICE 'Renomeado ACABAMENTOS: 12.1.1 → 12.1.2 (% linhas)', v_acao;
  END IF;

  -- 4. Renomeia o detalhamento BARRILHETES (12.1.1 → 12.1.3)
  UPDATE detalhamentos
  SET codigo = '12.1.3', ordem = 3
  WHERE tarefa_id = v_tarefa_12_1_id
    AND codigo = '12.1.1'
    AND descricao ILIKE '%BARRILHETES%';
  GET DIAGNOSTICS v_acao = ROW_COUNT;
  IF v_acao::int > 0 THEN
    v_renamed := v_renamed + v_acao::int;
    RAISE NOTICE 'Renomeado BARRILHETES: 12.1.1 → 12.1.3 (% linhas)', v_acao;
  END IF;

  -- 5. Se o 12.1.2 não existe, INSERE (caso tenha sido apagado pelo dedup)
  IF NOT EXISTS (
    SELECT 1 FROM detalhamentos WHERE tarefa_id = v_tarefa_12_1_id AND codigo = '12.1.2'
  ) THEN
    INSERT INTO detalhamentos (
      tarefa_id, codigo, descricao, disciplina, local, unidade,
      quantidade_contratada, valor_material_unit, valor_servico_unit,
      valor_unitario, ordem
    ) VALUES (
      v_tarefa_12_1_id,
      '12.1.2',
      'ACABAMENTOS ( RALOS DE FUNDO, ASPIRAÇÃO E RETORNO )',
      'HIDRAULICA',
      'LAZER',
      'UN',
      1,
      6610.93,
      1485.13,
      6610.93 + 1485.13,
      2
    );
    v_inserted := v_inserted + 1;
    RAISE NOTICE 'Inserido 12.1.2 ACABAMENTOS (estava faltando)';
  END IF;

  -- 6. Se o 12.1.3 não existe, INSERE
  IF NOT EXISTS (
    SELECT 1 FROM detalhamentos WHERE tarefa_id = v_tarefa_12_1_id AND codigo = '12.1.3'
  ) THEN
    INSERT INTO detalhamentos (
      tarefa_id, codigo, descricao, disciplina, local, unidade,
      quantidade_contratada, valor_material_unit, valor_servico_unit,
      valor_unitario, ordem
    ) VALUES (
      v_tarefa_12_1_id,
      '12.1.3',
      'BARRILHETES E BOMBAS ( BOMBAS FILTROS E VALVULAS )',
      'HIDRAULICA',
      'LAZER',
      'UN',
      1,
      52704.00,
      15711.37,
      52704.00 + 15711.37,
      3
    );
    v_inserted := v_inserted + 1;
    RAISE NOTICE 'Inserido 12.1.3 BARRILHETES (estava faltando)';
  END IF;

  -- 7. Garante que 12.1.1 TUBOS está com ordem 1
  UPDATE detalhamentos
  SET ordem = 1
  WHERE tarefa_id = v_tarefa_12_1_id
    AND codigo = '12.1.1'
    AND descricao ILIKE '%TUBOS%';

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'FIX 12.1.1 CONCLUÍDO';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Renomeados: %', v_renamed;
  RAISE NOTICE 'Inseridos:  %', v_inserted;
END $$;

-- ── CONFERÊNCIA ──
-- Deve mostrar 3 linhas: 12.1.1, 12.1.2, 12.1.3
SELECT d.codigo, d.ordem, d.valor_material_unit, d.valor_servico_unit,
       SUBSTR(d.descricao, 1, 60) AS descricao
FROM detalhamentos d
JOIN tarefas t ON t.id = d.tarefa_id
JOIN grupos_macro g ON g.id = t.grupo_macro_id
WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND t.codigo = '12.1'
ORDER BY d.ordem;

COMMIT;
