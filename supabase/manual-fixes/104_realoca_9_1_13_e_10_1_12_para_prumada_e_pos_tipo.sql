-- ---------------------------------------------------------------------------
-- 104 — Esgoto (9.1) e Hidráulica (10.1): realoca parte do pavimento tipo
--       para a prumada e o pós-tipo
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Decisão do Alex (03/11/2026): o material da prumada e do pós-tipo já está
-- 100% na obra e veio em pedidos lançados no pavimento tipo.
--
-- 9.1 — 92.450,35 saem do 9.1.13 (pavimento tipo), de pedidos 100% faturados:
--   destino  9.1.1 Prumada 50.000,00 · 9.1.14 Cobertura 17.439,55 ·
--            9.1.12 1º pav. 7.571,26 · 9.1.15 Rooftop 8.719,77 ·
--            9.1.16 Casa de máq. 8.719,77
--   origem (item 9.1.13 de cada pedido, M. A. Frota primeiro):
--     #1235 30.000,00 → 9.1.1 30.000,00                      (item inteiro)
--     #1468 19.079,18 → 9.1.1 19.079,18                      (item inteiro)
--     #1374 15.840,00 → 9.1.1 920,82 · 9.1.14 14.919,18      (item inteiro)
--     #1545 10.935,00 → 9.1.14 2.520,37 · 9.1.12 7.571,26 · 9.1.15 843,37
--     #1467  8.794,70 → 9.1.15 7.876,40 · 9.1.16 918,30      (item inteiro)
--     #1332  6.832,00 → 9.1.16 6.832,00                      (item inteiro)
--     #1408  5.305,60 → 9.1.16 969,47   (fica 4.336,13 no 9.1.13)
--
--   ⚠ ACEITO PELO ALEX: o 9.1.13 fica com comprado 68.735,87 (18,8%) contra
--   material medido 102.858,44 (28,1%). A camada ③ passa a pedir NF da FIP
--   de ~34.122,57 no 9.1.13 — "vai medir na próxima medição".
--
-- 10.1 — 51.223,40 do 10.1.12 para o 10.1.1 Prumada, no #1176 (Duratex,
--   100% faturado): 10.1.12 70.645,80 → 19.422,40 · 10.1.1 23.868,43 → 75.091,83.
--   O 10.1.12 fica com comprado 191.411,53 (48,0%) > medido 33,9%: sem FIP.
--
-- Efeito esperado (Material): 9.1.1, 9.1.12, 9.1.14, 9.1.15, 9.1.16 e 10.1.1
-- com NF 100% e Saldo a solicitar 0,00. 9.1.13 NF 36.734,87 (10,0%), saldo a
-- solicitar 297.494,60. 10.1.12 NF 171.411,47 (43,0%), saldo 207.364,20.
--
-- Impactos conferidos: valor dos pedidos e NFs não mudam; teto (028) não
-- dispara; desconto da Wave (camada ①) é por item sobre o medido e não lê a
-- alocação; pedidos de serviço da Wave e pedidos sem NF (#1727, #1770,
-- #1892) não são tocados.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater
-- (inclusive se já tiver sido rodado).
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: cada item de origem com o valor da coluna "origem" acima, pedido
-- 100% faturado (nf = total); livre de cada destino = valor a receber.
-- ===========================================================================
SELECT s.numero, d.codigo, i.valor_total, s.valor_total AS pedido,
       (SELECT round(SUM(n.valor), 2) FROM notas_fiscais_fat_direto n
         WHERE n.solicitacao_id = s.id AND n.status IN ('aguardando_aprovacao','em_correcao','aprovada')) AS nf
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN detalhamentos d           ON d.id = i.detalhamento_id
 WHERE i.id IN ('80265a1f-6f63-4b42-87a7-92e32f0c5a01', 'e659f7e0-1a1e-49cf-8fa7-fd4f9acae701',
                '3b74e866-ed0d-4742-be2a-2b8906f70592', 'd89befeb-95fa-4910-8cf7-5da93c01589c',
                '8ff111d5-cc6b-41ee-9fe9-bdc62d721249', 'aa5e6e91-5150-4b2e-9c69-2e60dc19eacb',
                '7fdedc90-3255-4553-89b0-0b82180e610d', '8b8f5f09-a0d5-4231-b22a-b090d004effe',
                '7501e292-8e06-49e3-ae6f-722d5060b483')
 ORDER BY s.numero, d.codigo;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_nota     CONSTANT text := E'\n\nAjuste 03/11/2026 (manual-fix 104): parte do item de pavimento tipo realocada para prumada/pós-tipo — material já na obra, veio neste pedido.';
  r          record;
  v_item     record;
  v_det      record;
  v_livre    numeric;
  v_total    numeric;
  v_nf       numeric;
  v_movido   numeric;
  v_primeiro boolean;
BEGIN
  -- Plano: (item de origem, valor original, destino, valor movido, ordem)
  CREATE TEMP TABLE _plano (item uuid, original numeric, destino text, valor numeric, ordem int) ON COMMIT DROP;
  INSERT INTO _plano VALUES
    ('80265a1f-6f63-4b42-87a7-92e32f0c5a01', 30000.00, '9.1.1',  30000.00, 1),
    ('e659f7e0-1a1e-49cf-8fa7-fd4f9acae701', 19079.18, '9.1.1',  19079.18, 1),
    ('3b74e866-ed0d-4742-be2a-2b8906f70592', 15840.00, '9.1.1',    920.82, 1),
    ('3b74e866-ed0d-4742-be2a-2b8906f70592', 15840.00, '9.1.14', 14919.18, 2),
    ('d89befeb-95fa-4910-8cf7-5da93c01589c', 10935.00, '9.1.14',  2520.37, 1),
    ('d89befeb-95fa-4910-8cf7-5da93c01589c', 10935.00, '9.1.12',  7571.26, 2),
    ('d89befeb-95fa-4910-8cf7-5da93c01589c', 10935.00, '9.1.15',   843.37, 3),
    ('8ff111d5-cc6b-41ee-9fe9-bdc62d721249',  8794.70, '9.1.15',  7876.40, 1),
    ('8ff111d5-cc6b-41ee-9fe9-bdc62d721249',  8794.70, '9.1.16',   918.30, 2),
    ('aa5e6e91-5150-4b2e-9c69-2e60dc19eacb',  6832.00, '9.1.16',  6832.00, 1),
    ('7fdedc90-3255-4553-89b0-0b82180e610d',  5305.60, '9.1.16',   969.47, 1);

  -- 0. Totais por destino batem com o saldo livre de cada um
  FOR r IN
    SELECT destino, SUM(valor) AS valor FROM _plano GROUP BY destino
    UNION ALL SELECT '10.1.1', 51223.40
  LOOP
    SELECT d.id, COALESCE(NULLIF(d.subtotal_material, 0),
                          COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0)) AS limite
      INTO v_det
      FROM detalhamentos d
      JOIN tarefas t      ON t.id = d.tarefa_id
      JOIN grupos_macro g ON g.id = t.grupo_macro_id
     WHERE g.contrato_id = c_contrato AND d.codigo = r.destino;
    IF v_det.id IS NULL THEN RAISE EXCEPTION 'Item % não encontrado', r.destino; END IF;
    SELECT v_det.limite - COALESCE(SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)), 0)
      INTO v_livre
      FROM itens_solicitacao_fat_direto i
      JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
     WHERE i.detalhamento_id = v_det.id
       AND s.status IN ('aprovado', 'aguardando_aprovacao')
       AND s.deletado_em IS NULL
       AND COALESCE(s.tipo, '') <> 'wave_servico';
    IF abs(v_livre - r.valor) > 0.01 THEN
      RAISE EXCEPTION 'Item %: livre % ≠ a receber %', r.destino, v_livre, r.valor;
    END IF;
  END LOOP;

  -- 1. 9.1: cada item de origem intacto, no 9.1.13, em pedido aprovado e 100% faturado
  FOR r IN SELECT item, MAX(original) AS original, SUM(valor) AS movido FROM _plano GROUP BY item LOOP
    SELECT i.id, i.solicitacao_id, i.valor_total, i.qtde_solicitada, s.valor_total AS pedido, d.codigo
      INTO v_item
      FROM itens_solicitacao_fat_direto i
      JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
      JOIN detalhamentos d           ON d.id = i.detalhamento_id
     WHERE i.id = r.item AND s.contrato_id = c_contrato AND s.status = 'aprovado' AND s.deletado_em IS NULL
       AND COALESCE(i.valor_devolvido, 0) = 0;
    IF v_item.id IS NULL OR v_item.codigo <> '9.1.13' OR abs(v_item.valor_total - r.original) > 0.02 THEN
      RAISE EXCEPTION 'Origem % fora do esperado (já rodado?)', r.item;
    END IF;
    SELECT COALESCE(SUM(valor), 0) INTO v_nf FROM notas_fiscais_fat_direto
     WHERE solicitacao_id = v_item.solicitacao_id AND status IN ('aguardando_aprovacao','em_correcao','aprovada');
    IF v_nf < v_item.pedido - 0.02 THEN
      RAISE EXCEPTION 'Pedido da origem % não está 100%% faturado (NF %, pedido %)', r.item, v_nf, v_item.pedido;
    END IF;
  END LOOP;

  -- 2. 9.1: aplica. Item inteiro → a 1ª parcela reaproveita a linha; parcial → reduz e insere.
  FOR r IN SELECT item, MAX(original) AS original, SUM(valor) AS movido FROM _plano GROUP BY item LOOP
    SELECT solicitacao_id, qtde_solicitada INTO v_item FROM itens_solicitacao_fat_direto WHERE id = r.item;
    v_primeiro := abs(r.movido - r.original) < 0.01;
    IF NOT v_primeiro THEN
      UPDATE itens_solicitacao_fat_direto
         SET valor_unitario = (r.original - r.movido) / qtde_solicitada
       WHERE id = r.item;
    END IF;
    FOR v_det IN
      SELECT p.valor, d.id AS det_id, d.tarefa_id, d.descricao
        FROM _plano p
        JOIN detalhamentos d ON d.codigo = p.destino
        JOIN tarefas t       ON t.id = d.tarefa_id
        JOIN grupos_macro g  ON g.id = t.grupo_macro_id
       WHERE p.item = r.item AND g.contrato_id = c_contrato
       ORDER BY p.ordem
    LOOP
      IF v_primeiro THEN
        UPDATE itens_solicitacao_fat_direto
           SET detalhamento_id = v_det.det_id, tarefa_id = v_det.tarefa_id, descricao = v_det.descricao,
               qtde_solicitada = 1, valor_unitario = v_det.valor
         WHERE id = r.item;
        v_primeiro := false;
      ELSE
        INSERT INTO itens_solicitacao_fat_direto
          (solicitacao_id, tarefa_id, detalhamento_id, descricao, local, qtde_solicitada, valor_unitario)
        VALUES (v_item.solicitacao_id, v_det.tarefa_id, v_det.det_id, v_det.descricao, 'TORRE', 1, v_det.valor);
      END IF;
    END LOOP;
  END LOOP;

  -- 3. 10.1: #1176 — 51.223,40 do 10.1.12 para o 10.1.1
  PERFORM 1 FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.id = '8b8f5f09-a0d5-4231-b22a-b090d004effe' AND d.codigo = '10.1.12'
     AND abs(i.valor_total - 70645.80) < 0.02;
  IF NOT FOUND THEN RAISE EXCEPTION '#1176 sem o 10.1.12 de 70.645,80 (já rodado?)'; END IF;
  PERFORM 1 FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.id = '7501e292-8e06-49e3-ae6f-722d5060b483' AND d.codigo = '10.1.1'
     AND abs(i.valor_total - 23868.43) < 0.02;
  IF NOT FOUND THEN RAISE EXCEPTION '#1176 sem o 10.1.1 de 23.868,43 (já rodado?)'; END IF;
  UPDATE itens_solicitacao_fat_direto SET valor_unitario = 19422.40 / qtde_solicitada
   WHERE id = '8b8f5f09-a0d5-4231-b22a-b090d004effe';
  UPDATE itens_solicitacao_fat_direto SET valor_unitario = 75091.83 / qtde_solicitada
   WHERE id = '7501e292-8e06-49e3-ae6f-722d5060b483';

  -- 4. Soma dos itens = valor do pedido em todos os pedidos tocados
  FOR r IN
    SELECT s.id, s.numero, s.valor_total FROM solicitacoes_fat_direto s
     WHERE s.id IN (SELECT DISTINCT i.solicitacao_id FROM itens_solicitacao_fat_direto i
                     WHERE i.id IN (SELECT item FROM _plano) OR i.id = '8b8f5f09-a0d5-4231-b22a-b090d004effe')
  LOOP
    SELECT SUM(valor_total) INTO v_total FROM itens_solicitacao_fat_direto WHERE solicitacao_id = r.id;
    IF abs(v_total - r.valor_total) > 0.02 THEN
      RAISE EXCEPTION 'Pedido #%: soma dos itens % ≠ %', r.numero, v_total, r.valor_total;
    END IF;
    UPDATE solicitacoes_fat_direto SET observacoes = COALESCE(observacoes, '') || v_nota WHERE id = r.id;
  END LOOP;

  -- 5. Totais por item como planejado
  FOR r IN
    SELECT * FROM (VALUES ('9.1.1', 327190.92), ('9.1.12', 17439.55), ('9.1.13', 68735.87),
                          ('9.1.14', 17439.55), ('9.1.15', 8719.77), ('9.1.16', 8719.77),
                          ('10.1.1', 184618.39), ('10.1.12', 191411.53)) AS x(codigo, esperado)
  LOOP
    SELECT COALESCE(SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)), 0) INTO v_movido
      FROM itens_solicitacao_fat_direto i
      JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
      JOIN detalhamentos d           ON d.id = i.detalhamento_id
      JOIN tarefas t                 ON t.id = d.tarefa_id
      JOIN grupos_macro g            ON g.id = t.grupo_macro_id
     WHERE g.contrato_id = c_contrato AND d.codigo = r.codigo
       AND s.status IN ('aprovado', 'aguardando_aprovacao') AND s.deletado_em IS NULL
       AND COALESCE(s.tipo, '') <> 'wave_servico';
    IF abs(v_movido - r.esperado) > 0.02 THEN
      RAISE EXCEPTION 'Item %: comprometido % ≠ esperado %', r.codigo, v_movido, r.esperado;
    END IF;
  END LOOP;

  RAISE NOTICE 'OK: 9.1 (92.450,35) e 10.1 (51.223,40) realocados';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA. Comprometido de material por item.
-- Esperado: 9.1.1 327190.92 · 9.1.12 17439.55 · 9.1.13 68735.87 · 9.1.14 17439.55 ·
--           9.1.15 8719.77 · 9.1.16 8719.77 · 10.1.1 184618.39 · 10.1.12 191411.53
-- ===========================================================================
SELECT d.codigo, SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)) AS comprometido
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN detalhamentos d           ON d.id = i.detalhamento_id
  JOIN tarefas t                 ON t.id = d.tarefa_id
  JOIN grupos_macro g            ON g.id = t.grupo_macro_id
 WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND d.codigo IN ('9.1.1','9.1.12','9.1.13','9.1.14','9.1.15','9.1.16','10.1.1','10.1.12')
   AND s.status IN ('aprovado', 'aguardando_aprovacao') AND s.deletado_em IS NULL
   AND COALESCE(s.tipo, '') <> 'wave_servico'
 GROUP BY d.codigo
 ORDER BY string_to_array(d.codigo, '.')::int[];
