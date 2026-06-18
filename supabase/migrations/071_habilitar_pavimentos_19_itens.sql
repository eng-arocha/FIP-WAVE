-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 071 — Habilitar subdivisão por pavimento para 19 detalhamentos
--
-- A função detectarPavRange() exige duas condições:
--   1. Descrição contém "PAV TIPO" ou "PAVIMENTO TIPO"
--   2. Descrição contém "( X AO Y° PAV )" com "PAV" explícito no fim
--
-- Problemas encontrados nos 19 itens solicitados:
--   A) A maioria tem "( 1° AO 36 )" sem "PAV" no fim — regex não casa.
--   B) Alguns têm formatos não-padrão (ex.: "1 ao 36", "TIPO 1 AO 36", "36 VEZES").
--   C) 14.1.6 tem 46 unidades (Subsolo 4 ao Pav Tipo 36).
--   D) Tarefa 15.2 (EXTINTORES) tem códigos errados 15.1.x → precisa 15.2.x.
--   E) Itens EQUIPAMENTOS GÁS (grupo 17) têm códigos 17.1.x → precisa 17.2.x.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_contrato  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_tarefa_id uuid;
  v_cnt       int;
BEGIN

  -- ── D) Corrigir códigos da tarefa 15.2 (EXTINTORES: 15.1.x → 15.2.x) ────
  SELECT t.id INTO v_tarefa_id
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE gm.contrato_id = v_contrato AND t.codigo = '15.2';

  IF v_tarefa_id IS NOT NULL THEN
    UPDATE detalhamentos
       SET codigo = REPLACE(codigo, '15.1.', '15.2.')
     WHERE tarefa_id = v_tarefa_id
       AND codigo ~ '^15\.1\.\d+$'
       AND UPPER(TRIM(descricao)) LIKE 'INSTALAÇÕES EXTINTORES%';
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RAISE NOTICE 'Tarefa 15.2 EXTINTORES: % códigos renomeados 15.1.x → 15.2.x', v_cnt;
  ELSE
    RAISE NOTICE 'Tarefa 15.2 não encontrada — skip rename';
  END IF;

  -- ── E) Corrigir códigos de EQUIPAMENTOS GÁS (17.1.x → 17.2.x) ───────────
  UPDATE detalhamentos d
     SET codigo = REPLACE(d.codigo, '17.1.', '17.2.')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND gm.codigo = '17'
     AND d.codigo ~ '^17\.1\.\d+$'
     AND (
       UPPER(TRIM(d.descricao)) LIKE 'EQUIPAMENTOS%GÁS%'
    OR UPPER(TRIM(d.descricao)) LIKE 'EQUIPAMENTOS%GAS%'
     );
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE 'Grupo 17 EQUIPAMENTOS GÁS: % códigos renomeados 17.1.x → 17.2.x', v_cnt;


  -- ── A) Padrão mais comum: "( 1° AO 36 )" → "( 1° AO 36° PAV )" ──────────
  -- Cobre: 3.1.11 3.2.11 4.1.11 4.2.11 4.3.11 5.1.11 7.1.10
  --        15.1.11(SINALIZAÇÃO) 15.2.11(EXTINTORES)
  --        16.1.11 16.2.11(CABEAMENTO) 16.3.11(EQUIPAMENTOS SDAI)
  --        17.1.5(TUBOS GÁS)  17.2.3(EQUIPAMENTOS GÁS)
  UPDATE detalhamentos d
     SET descricao = REPLACE(d.descricao, '( 1° AO 36 )', '( 1° AO 36° PAV )')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.descricao LIKE '%( 1° AO 36 )%'
     AND d.descricao NOT LIKE '%( 1° AO 36° PAV )%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE 'Padrão "( 1° AO 36 )": % descrições corrigidas', v_cnt;

  -- Variante minúscula: "( 1 ao 36 )" (14.1.2 HIDRANTE)
  UPDATE detalhamentos d
     SET descricao = REPLACE(d.descricao, '( 1 ao 36 )', '( 1° AO 36° PAV )')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.descricao LIKE '%( 1 ao 36 )%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE 'Padrão "( 1 ao 36 )": % descrições corrigidas', v_cnt;

  -- Variante "1o AO 36" (seed original migration 015 usava "1o" em vez de "1°")
  UPDATE detalhamentos d
     SET descricao = REPLACE(d.descricao, '( 1o AO 36 )', '( 1° AO 36° PAV )')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.descricao LIKE '%( 1o AO 36 )%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE 'Padrão "( 1o AO 36 )": % descrições corrigidas', v_cnt;

  -- ── B) 14.2.13 SPRINKLER: "( 1° ao 36° )" → "( 1° AO 36° PAV )" ─────────
  UPDATE detalhamentos d
     SET descricao = REPLACE(d.descricao, '( 1° ao 36° )', '( 1° AO 36° PAV )')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.descricao LIKE '%( 1° ao 36° )%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE 'Padrão "( 1° ao 36° )": % descrições corrigidas (14.2.13 SPRINKLER)', v_cnt;

  -- ── B) 13.2.1 LOUÇAS E METAIS: "PAVIMENTO TIPO 1 AO 36" ──────────────────
  UPDATE detalhamentos d
     SET descricao = REPLACE(d.descricao, 'PAVIMENTO TIPO 1 AO 36', 'PAVIMENTO TIPO ( 1° AO 36° PAV )')
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.codigo = '13.2.1'
     AND d.descricao LIKE '%PAVIMENTO TIPO 1 AO 36%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '13.2.1 LOUÇAS E METAIS: % descrições corrigidas', v_cnt;

  -- ── B) 6.1.11 QL TIPO: sem "PAV TIPO" → adicionar ────────────────────────
  -- "QL TIPO (36 VEZES)" → "QL TIPO - PAV TIPO ( 1° AO 36° PAV )"
  UPDATE detalhamentos d
     SET descricao = 'QL TIPO - PAV TIPO ( 1° AO 36° PAV )'
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.codigo = '6.1.11'
     AND d.descricao ILIKE '%QL TIPO%VEZES%';
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '6.1.11 QL TIPO: % descrições corrigidas', v_cnt;

  -- ── C) 14.1.6 HIDRANTE SS4-PAV36 (46 unidades): adicionar range ──────────
  -- "CAIXAS E ACESSORIOS - HIDRANTE - SUBSOLO 4 A0 PAV TIPO 36"
  -- → adiciona "( 1° AO 46° PAV )" para que as 46 unidades sejam
  --   medidas individualmente (SS4=1, SS3=2, ..., PAV TIPO 1=11, ..., PAV 36=46).
  UPDATE detalhamentos d
     SET descricao = d.descricao || ' ( 1° AO 46° PAV )'
    FROM tarefas t
    JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
   WHERE d.tarefa_id = t.id
     AND gm.contrato_id = v_contrato
     AND d.codigo = '14.1.6'
     AND d.descricao NOT LIKE '%( 1° AO 46° PAV )%'
     AND d.quantidade_contratada = 46;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RAISE NOTICE '14.1.6 HIDRANTE SS4-PAV36: % descrições corrigidas', v_cnt;

  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'MIGRATION 071 CONCLUÍDA';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

-- Conferência final: listar os 19 itens e suas descrições pós-migração
SELECT d.codigo, SUBSTR(d.descricao, 1, 70) AS descricao, d.quantidade_contratada
  FROM detalhamentos d
  JOIN tarefas t ON t.id = d.tarefa_id
  JOIN grupos_macro gm ON gm.id = t.grupo_macro_id
 WHERE gm.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND d.codigo IN (
     '3.1.11','3.2.11','4.1.11','4.2.11','4.3.11','5.1.11','6.1.11',
     '7.1.10','13.2.1','14.1.2','14.1.6','14.2.13',
     '15.1.11','15.2.11','16.1.11','16.2.11','16.3.11',
     '17.1.5','17.2.3'
   )
 ORDER BY d.codigo, d.descricao;

COMMIT;
