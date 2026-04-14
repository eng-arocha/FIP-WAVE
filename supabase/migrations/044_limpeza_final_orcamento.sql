-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 044 — LIMPEZA FINAL: dedupe detalhamentos + insere tarefas faltantes
--
-- Roda DENTRO de uma transação. No final tem SELECT de conferência.
-- Se OK → COMMIT; Se estranho → ROLLBACK;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_contrato uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_tarefas_json jsonb;
  v_tarefa jsonb;
  v_grupo_id uuid;
  v_valor_unit numeric;
  v_dup_deletados int := 0;
  v_tarefas_ins int := 0;
  v_tarefas_skip int := 0;
BEGIN

  -- ── 1. DEDUP DETALHAMENTOS ─────────────────────────────────────────
  -- Mantém o MAIS ANTIGO (tem FK das solicitações), deleta os outros com mesmo codigo+tarefa_id
  WITH ranked AS (
    SELECT d.id,
           ROW_NUMBER() OVER (
             PARTITION BY d.tarefa_id, d.codigo
             ORDER BY d.created_at ASC, d.id ASC
           ) AS rn
    FROM detalhamentos d
    JOIN tarefas t ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
    WHERE g.contrato_id = v_contrato
  ),
  deletados AS (
    DELETE FROM detalhamentos
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_dup_deletados FROM deletados;

  -- ── 2. INSERE TAREFAS FALTANTES DA PLANILHA ────────────────────────
  v_tarefas_json := '[{"grupo_codigo":"1","codigo":"1.1","nome":"ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":14403.44,"valor_servico":16344.34,"ordem":1},{"grupo_codigo":"1","codigo":"1.2","nome":"ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":6453.21,"valor_servico":2442.2,"ordem":2},{"grupo_codigo":"1","codigo":"1.3","nome":"ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":320380.45,"valor_servico":28550.940000000002,"ordem":3},{"grupo_codigo":"1","codigo":"1.4","nome":"SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":10523.68,"valor_servico":16385.84,"ordem":4},{"grupo_codigo":"1","codigo":"1.5","nome":"SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":14837.15,"valor_servico":5277.13,"ordem":5},{"grupo_codigo":"1","codigo":"1.6.","nome":"SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":146668.2,"valor_servico":12706.04,"ordem":6},{"grupo_codigo":"1","codigo":"1.7","nome":"SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG''s )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":43816.48,"valor_servico":11088.9,"ordem":7},{"grupo_codigo":"1","codigo":"1.8","nome":"SUBESTAÇÃO PMUC - QUADROS ( CPG''s )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":119977.36,"valor_servico":4950.4,"ordem":8},{"grupo_codigo":"1","codigo":"1.9","nome":"SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":12009.39,"valor_servico":11897.47,"ordem":9},{"grupo_codigo":"1","codigo":"1.10","nome":"SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":7838.02,"valor_servico":2772.23,"ordem":10},{"grupo_codigo":"1","codigo":"1.11","nome":"SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":71783.1,"valor_servico":6105.5,"ordem":11},{"grupo_codigo":"1","codigo":"1.12","nome":"SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG'')","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":21908.24,"valor_servico":5544.45,"ordem":12},{"grupo_codigo":"1","codigo":"1.13","nome":"SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":32751.2,"valor_servico":2970.24,"ordem":13},{"grupo_codigo":"1","codigo":"1.14","nome":"ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":15472.4,"valor_servico":10147.27,"ordem":14},{"grupo_codigo":"2","codigo":"2.1","nome":"GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":431063.7,"valor_servico":15445.47,"ordem":1},{"grupo_codigo":"2","codigo":"2.2","nome":"GRUPO GERADOR PMUC  - PAINEIS (  QTA''s + Quadros reversão )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":352689.9,"valor_servico":37161.4,"ordem":2},{"grupo_codigo":"2","codigo":"2.3","nome":"GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":25823.49,"valor_servico":35118.29,"ordem":3},{"grupo_codigo":"2","codigo":"2.4","nome":"GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":115009.9,"valor_servico":29009.37,"ordem":4},{"grupo_codigo":"2","codigo":"2.5","nome":"GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":415311.09,"valor_servico":15742.28,"ordem":5},{"grupo_codigo":"2","codigo":"2.6","nome":"GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":101132.64,"valor_servico":11880.97,"ordem":6},{"grupo_codigo":"2","codigo":"2.7","nome":"GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":38592.130000000005,"valor_servico":24969.760000000002,"ordem":7},{"grupo_codigo":"2","codigo":"2.8","nome":"GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":124191.1,"valor_servico":51514.18,"ordem":8},{"grupo_codigo":"2","codigo":"2.9","nome":"GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":6199.97,"valor_servico":3600.59,"ordem":9},{"grupo_codigo":"3","codigo":"3.1","nome":"INFRAESTRUTURA -  ALIMENTAÇÃO ELÉTRICA ( Eletrocalhas,Eletrodutos, caixas )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":356035.4600000001,"valor_servico":385390.54999999993,"ordem":1},{"grupo_codigo":"3","codigo":"3.2","nome":"CABEAMENTO- ALIMENTAÇÃO ELÉTRICA ( CABOS ATOX 1KV )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":1141104.7448,"valor_servico":652482.3697316963,"ordem":2},{"grupo_codigo":"4","codigo":"4.1","nome":"INFRAESTRUTURA -  DISTRIBUIÇÃO ELÉTRICA (Eletrocalhas, eletrodutos e caixas )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":127341.25,"valor_servico":402794.88,"ordem":1},{"grupo_codigo":"4","codigo":"4.2","nome":"CABEAMENTO- DISTRIBUIÇÃO ELETRICA ( Cabos 750v 2,5mm², 4mm² e 6mm² )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":175718.44999999998,"valor_servico":242849.88000000003,"ordem":2},{"grupo_codigo":"4","codigo":"4.3","nome":"ACABAMENTO - DISTRIBUIÇÃO ELETRICA ( Tomadas e Interruptores )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":14076.51,"valor_servico":25115.05,"ordem":3},{"grupo_codigo":"5","codigo":"5.1","nome":"NSTALAÇÕES DE LUMINÁRIAS CONFORME PROJETO ( SOMENTE MÃO DE OBRA )","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":0,"valor_servico":287273.52,"ordem":1},{"grupo_codigo":"6","codigo":"6.1","nome":"QUADROS DE ILUMINAÇÃO","disciplina":"ELÉTRICA","local":"TORRE","qtde_contratada":1.0,"valor_material":661523.6316099999,"valor_servico":312415.4370008156,"ordem":1},{"grupo_codigo":"7","codigo":"7.1","nome":"INFRAESTRUTURA -  DADOS E VOZ (Eletrocalhas, eletrodutos e caixas )","disciplina":"DADOS","local":"TORRE","qtde_contratada":1.0,"valor_material":143093.3,"valor_servico":134708.07,"ordem":1},{"grupo_codigo":"8","codigo":"8.1","nome":"ÁGUA PLUVIAL ( TUBOS E CONEXÕES )","disciplina":"HIDROSSANITÁRIA","local":"TORRE","qtde_contratada":1.0,"valor_material":601272.52925,"valor_servico":777108.5068000002,"ordem":1},{"grupo_codigo":"8","codigo":"8.2","nome":"BARRILHETE DE BOMBAS DRENAGEM","disciplina":"HIDROSSANITÁRIA","local":"TORRE","qtde_contratada":1.0,"valor_material":39371.99,"valor_servico":11261.81,"ordem":2},{"grupo_codigo":"9","codigo":"9.1","nome":"ESGOTO SANITARIO","disciplina":"HIDROSSANITÁRIA","local":"TORRE","qtde_contratada":1.0,"valor_material":850377.3099999998,"valor_servico":1047756.4499999997,"ordem":1},{"grupo_codigo":"10","codigo":"10.1","nome":"HIDRÁULICA (ÁGUA FRIA)","disciplina":"HIDRAULICA","local":"TORRE","qtde_contratada":1.0,"valor_material":738473.57,"valor_servico":683602.35,"ordem":1},{"grupo_codigo":"10","codigo":"10.2","nome":"HIDRÁULICA (ÁGUA QUENTE)","disciplina":"HIDRAULICA","local":"TORRE","qtde_contratada":1.0,"valor_material":340264.72000000003,"valor_servico":332979.609,"ordem":2},{"grupo_codigo":"10","codigo":"10.3","nome":"HIDRÁULICA (BARRILHETES BOMBAS E REDUTORAS)","disciplina":"HIDRAULICA","local":"TORRE","qtde_contratada":1.0,"valor_material":574966.3,"valor_servico":182053.95999999996,"ordem":3},{"grupo_codigo":"12","codigo":"12.1","nome":"","disciplina":"HIDRAULICA","local":"TORRE","qtde_contratada":1.0,"valor_material":89578.25,"valor_servico":39196.5,"ordem":1},{"grupo_codigo":"13","codigo":"13.1","nome":"PILOTIS ( SÓ MÃO DE OBRA )","disciplina":"LOUÇAS E METAIS","local":"TORRE","qtde_contratada":1.0,"valor_material":0,"valor_servico":18000.61,"ordem":1},{"grupo_codigo":"13","codigo":"13.2","nome":"APARTAMENTOS","disciplina":"LOUÇAS E METAIS","local":"TORRE","qtde_contratada":1.0,"valor_material":71112.44,"valor_servico":37174.54,"ordem":2},{"grupo_codigo":"14","codigo":"14.1","nome":"HIDRANTE","disciplina":"INCÊNDIO","local":"TORRE","qtde_contratada":1.0,"valor_material":302777.986,"valor_servico":37709.9744,"ordem":1},{"grupo_codigo":"14","codigo":"14.2","nome":"SPRINKLERS","disciplina":"INCÊNDIO","local":"TORRE","qtde_contratada":1.0,"valor_material":895345.44,"valor_servico":307269.47812000004,"ordem":2},{"grupo_codigo":"14","codigo":"14.3","nome":"BOMBAS E BARRILHETES","disciplina":"INCENDIO","local":"TORRE","qtde_contratada":1.0,"valor_material":114044.75,"valor_servico":25182.08,"ordem":3},{"grupo_codigo":"15","codigo":"15.1","nome":"LUMINARIAS DE EMERGENCIA + ROTA DE FUGA","disciplina":"INCÊNDIO","local":"TORRE","qtde_contratada":1.0,"valor_material":39558.21,"valor_servico":20973.21,"ordem":1},{"grupo_codigo":"15","codigo":"15.2","nome":"EXTINTORES","disciplina":"INCÊNDIO","local":"TORRE","qtde_contratada":1.0,"valor_material":80278.63,"valor_servico":9658.289999999999,"ordem":2},{"grupo_codigo":"16","codigo":"16.1","nome":"INFRA ESTRUTURA ( ELTRODUTOS E CAIXAS )","disciplina":"SDAI","local":"TORRE","qtde_contratada":1.0,"valor_material":59829.91,"valor_servico":79962.37299999999,"ordem":1},{"grupo_codigo":"16","codigo":"16.2","nome":"CABEAMENTO SDAI ( CABO BLINDADO )","disciplina":"SDAI","local":"TORRE","qtde_contratada":1.0,"valor_material":26811.43,"valor_servico":29508.861120000005,"ordem":2},{"grupo_codigo":"16","codigo":"16.3","nome":"EQUIPAMENTOS","disciplina":"SDAI","local":"TORRE","qtde_contratada":1.0,"valor_material":165878.55,"valor_servico":40783.07,"ordem":3},{"grupo_codigo":"17","codigo":"17.1","nome":"TUBOS E CONEXÕES","disciplina":"GAS","local":"TORRE","qtde_contratada":1.0,"valor_material":105317.78,"valor_servico":55776.12,"ordem":1},{"grupo_codigo":"17","codigo":"17.1","nome":"CAIXAS, REGULADORES E VALVULAS","disciplina":"GAS","local":"TORRE","qtde_contratada":1.0,"valor_material":79408.85,"valor_servico":15064.099999999999,"ordem":2},{"grupo_codigo":"18","codigo":"18.1","nome":"SPDA","disciplina":"SPDA","local":"TORRE","qtde_contratada":1.0,"valor_material":191601.77,"valor_servico":144323.09,"ordem":1},{"grupo_codigo":"19","codigo":"19.1","nome":"DESCREVER SUBDIVISÃO","disciplina":"OUTROS","local":"TORRE","qtde_contratada":1.0,"valor_material":866000.0,"valor_servico":0,"ordem":1}]'::jsonb;

  FOR v_tarefa IN SELECT * FROM jsonb_array_elements(v_tarefas_json) LOOP
    -- Acha grupo pai
    SELECT id INTO v_grupo_id FROM grupos_macro
    WHERE contrato_id = v_contrato AND codigo = v_tarefa->>'grupo_codigo';

    IF v_grupo_id IS NULL THEN
      v_tarefas_skip := v_tarefas_skip + 1;
      CONTINUE;
    END IF;

    -- Se tarefa já existe, pula
    IF EXISTS (
      SELECT 1 FROM tarefas
      WHERE grupo_macro_id = v_grupo_id AND codigo = v_tarefa->>'codigo'
    ) THEN
      v_tarefas_skip := v_tarefas_skip + 1;
      CONTINUE;
    END IF;

    -- INSERT
    v_valor_unit := (v_tarefa->>'valor_material')::numeric + (v_tarefa->>'valor_servico')::numeric;
    INSERT INTO tarefas (
      grupo_macro_id, codigo, nome, disciplina, local,
      quantidade_contratada, valor_unitario, valor_total, ordem
    ) VALUES (
      v_grupo_id,
      v_tarefa->>'codigo',
      v_tarefa->>'nome',
      v_tarefa->>'disciplina',
      v_tarefa->>'local',
      (v_tarefa->>'qtde_contratada')::numeric,
      v_valor_unit,
      v_valor_unit * GREATEST((v_tarefa->>'qtde_contratada')::numeric, 1),
      (v_tarefa->>'ordem')::int
    );
    v_tarefas_ins := v_tarefas_ins + 1;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'LIMPEZA FINAL CONCLUÍDA';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE 'Detalhamentos duplicados deletados: %', v_dup_deletados;
  RAISE NOTICE 'Tarefas inseridas (estavam faltando): %', v_tarefas_ins;
  RAISE NOTICE 'Tarefas já existentes (puladas):      %', v_tarefas_skip;
  RAISE NOTICE '';
END $$;

-- ── CONFERÊNCIA FINAL ──
SELECT
  (SELECT COUNT(*) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS grupos,
  (SELECT COUNT(*) FROM tarefas t JOIN grupos_macro g ON g.id = t.grupo_macro_id WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS tarefas,
  (SELECT COUNT(*) FROM detalhamentos d JOIN tarefas t ON t.id = d.tarefa_id JOIN grupos_macro g ON g.id = t.grupo_macro_id WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS detalhamentos,
  ROUND((SELECT SUM(valor_material) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2) AS total_material,
  ROUND((SELECT SUM(valor_servico) FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 2) AS total_mo;

-- ════════════════════════════════════════════════════════════════════════
-- ESPERADO:
--   grupos = 18  tarefas = 52  detalhamentos = 335
--   total_material = 11,300,000.00  total_mo = 6,700,000.00
--
-- Se bateu → COMMIT;  Se não → ROLLBACK;
-- ════════════════════════════════════════════════════════════════════════
