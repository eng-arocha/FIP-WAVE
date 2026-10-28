-- ---------------------------------------------------------------------------
-- 098 — Realoca pedidos de material que passaram do contratado do item
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Diagnóstico: docs/DIVIDAS.md (28/10/2026, "Itens de material acima do
-- contratado"). Decisão do Alex (28/10/2026): realocar; o resto do #20 fica
-- no 1.3.1 até decidir com a FIP.
--
--   #20  (FIP, MED-007) 34eebb0f-1363-4abf-a2b7-d55e31c11f51
--        1.3.1: 153.471,24 → 71.305,95. Os 82.165,29 vão para os itens do
--        grupo 1 com serviço medido e material sem cobertura:
--          1.13.1 32.751,20 · 1.5.1 14.837,15 · 1.11.1 12.673,44 ·
--          1.6.1 11.735,88 · 1.4.1 5.261,84 · 1.9.1 3.002,34 · 1.1.1 1.903,44
--        Os 71.305,95 que ficam no 1.3.1 seguem ACIMA do contratado —
--        pendência com a FIP (até 22.013,94 cabem como adiantamento no
--        grupo 1; 49.292,01 passam do contrato do grupo).
--   #895 (ALCONORT)     50a25075-3ada-46a4-ade3-74d9a230d3b9
--        3.1.1 (Subsolo 04) 8.688,85 → 3.1.4 (Subsolo 01) 5.155,52 +
--        3.1.15 (Infra vertical) 3.533,33. O pedido diz "Subsolo 01".
--   #1081 (M. A. FROTA) 78a4f728-fa76-494a-8438-151c7b48fa63
--        17.2.1 5.932,09 → 17.1.1 (livre exatamente 5.932,09).
--
-- CONFLITO COM O 097: nenhum.
--   - O 097 mexeu na MED-007 (totais, retenção), no pedido Wave nº 21 e nos
--     snapshots nf_material_descontada. Nada disso é tocado aqui.
--   - O desconto de material (camada ①) usa material medido − snapshots; não
--     lê a alocação dos itens de pedido. O desconto da MED-008 não muda.
--   - "FIP precisa emitir" (camada ③) soma por grupo; as três realocações
--     ficam dentro do mesmo grupo (1, 3, 17). Total do grupo não muda.
--   - Valor total dos pedidos e as NFs não mudam; a NF é rateada pelos itens.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Itens atuais dos três pedidos + saldo livre de material de cada destino.
-- Esperado: #20 = 1.3.1 153471.24 + 2.2.1 35268.99 · #895 = 3.1.1 8688.85 ·
--           #1081 = 17.2.1 5932.09; livre ≥ valor de destino em todas as linhas.
-- ===========================================================================
WITH det AS (
  SELECT d.id, d.codigo, d.tarefa_id,
         COALESCE(NULLIF(d.subtotal_material, 0),
                  COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0)) AS limite
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
),
comprometido AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)) AS valor
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status IN ('aprovado', 'aguardando_aprovacao')
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, '') <> 'wave_servico'
   GROUP BY i.detalhamento_id
)
SELECT 'atual' AS tipo, s.numero, det.codigo, i.valor_total, NULL::numeric AS livre
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN det ON det.id = i.detalhamento_id
 WHERE i.solicitacao_id IN ('34eebb0f-1363-4abf-a2b7-d55e31c11f51',
                            '50a25075-3ada-46a4-ade3-74d9a230d3b9',
                            '78a4f728-fa76-494a-8438-151c7b48fa63')
UNION ALL
SELECT 'destino', NULL, det.codigo, v.valor, round(det.limite - COALESCE(c.valor, 0), 2)
  FROM (VALUES ('1.13.1', 32751.20), ('1.5.1', 14837.15), ('1.11.1', 12673.44),
               ('1.6.1', 11735.88), ('1.4.1', 5261.84), ('1.9.1', 3002.34),
               ('1.1.1', 1903.44), ('3.1.4', 5155.52), ('3.1.15', 3533.33),
               ('17.1.1', 5932.09)) AS v(codigo, valor)
  JOIN det ON det.codigo = v.codigo
  LEFT JOIN comprometido c ON c.detalhamento_id = det.id
 ORDER BY 1, 3;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_p20      CONSTANT uuid := '34eebb0f-1363-4abf-a2b7-d55e31c11f51';
  c_p895     CONSTANT uuid := '50a25075-3ada-46a4-ade3-74d9a230d3b9';
  c_p1081    CONSTANT uuid := '78a4f728-fa76-494a-8438-151c7b48fa63';
  v_nota     CONSTANT text := E'\n\nAjuste 28/10/2026 (manual-fix 098): itens realocados — item acima do contratado (docs/DIVIDAS.md).';
  r          record;
  v_item     uuid;
  v_det      record;
  v_livre    numeric;
  v_total    numeric;
BEGIN
  -- 0. Pedidos no estado esperado (valor total não muda)
  FOR r IN
    SELECT * FROM (VALUES (c_p20, 188740.23), (c_p895, 8688.85), (c_p1081, 5932.09)) AS x(id, total)
  LOOP
    SELECT valor_total INTO v_total FROM solicitacoes_fat_direto
     WHERE id = r.id AND contrato_id = c_contrato AND status = 'aprovado' AND deletado_em IS NULL;
    IF v_total IS NULL OR abs(v_total - r.total) > 0.02 THEN
      RAISE EXCEPTION 'Pedido % com valor/status inesperado: %', r.id, v_total;
    END IF;
  END LOOP;

  -- 1. Saldo livre em cada destino (mesma regra da trava do app: material,
  --    aprovado + aguardando, menos devoluções, sem pedido Wave de serviço)
  FOR r IN
    SELECT * FROM (VALUES ('1.13.1', 32751.20), ('1.5.1', 14837.15), ('1.11.1', 12673.44),
                          ('1.6.1', 11735.88), ('1.4.1', 5261.84), ('1.9.1', 3002.34),
                          ('1.1.1', 1903.44), ('3.1.4', 5155.52), ('3.1.15', 3533.33),
                          ('17.1.1', 5932.09)) AS x(codigo, valor)
  LOOP
    SELECT d.id,
           COALESCE(NULLIF(d.subtotal_material, 0),
                    COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0)) AS limite
      INTO v_det
      FROM detalhamentos d
      JOIN tarefas t      ON t.id = d.tarefa_id
      JOIN grupos_macro g ON g.id = t.grupo_macro_id
     WHERE g.contrato_id = c_contrato AND d.codigo = r.codigo;
    IF v_det.id IS NULL THEN RAISE EXCEPTION 'Item % não encontrado', r.codigo; END IF;
    SELECT v_det.limite - COALESCE(SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)), 0)
      INTO v_livre
      FROM itens_solicitacao_fat_direto i
      JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
     WHERE i.detalhamento_id = v_det.id
       AND s.status IN ('aprovado', 'aguardando_aprovacao')
       AND s.deletado_em IS NULL
       AND COALESCE(s.tipo, '') <> 'wave_servico';
    IF v_livre < r.valor - 0.01 THEN
      RAISE EXCEPTION 'Item % sem saldo: livre %, precisa %', r.codigo, v_livre, r.valor;
    END IF;
  END LOOP;

  -- 2. #20: 1.3.1 fica com 71.305,95; 82.165,29 vão para o grupo 1
  SELECT i.id INTO v_item
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.solicitacao_id = c_p20 AND d.codigo = '1.3.1' AND abs(i.valor_total - 153471.24) < 0.02;
  IF v_item IS NULL THEN RAISE EXCEPTION '#20 sem o item 1.3.1 de 153.471,24'; END IF;
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = 71305.95 / qtde_solicitada
   WHERE id = v_item;

  INSERT INTO itens_solicitacao_fat_direto
    (solicitacao_id, tarefa_id, detalhamento_id, descricao, local, qtde_solicitada, valor_unitario)
  SELECT c_p20, d.tarefa_id, d.id, d.descricao, 'TORRE', 1, v.valor
    FROM (VALUES ('1.13.1', 32751.20), ('1.5.1', 14837.15), ('1.11.1', 12673.44),
                 ('1.6.1', 11735.88), ('1.4.1', 5261.84), ('1.9.1', 3002.34),
                 ('1.1.1', 1903.44)) AS v(codigo, valor)
    JOIN detalhamentos d ON d.codigo = v.codigo
    JOIN tarefas t       ON t.id = d.tarefa_id
    JOIN grupos_macro g  ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = c_contrato;

  -- 3. #895: 3.1.1 → 3.1.4 (5.155,52) + 3.1.15 (3.533,33)
  SELECT i.id INTO v_item
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.solicitacao_id = c_p895 AND d.codigo = '3.1.1' AND abs(i.valor_total - 8688.85) < 0.02;
  IF v_item IS NULL THEN RAISE EXCEPTION '#895 sem o item 3.1.1 de 8.688,85'; END IF;
  UPDATE itens_solicitacao_fat_direto i
     SET detalhamento_id = d.id, tarefa_id = d.tarefa_id, valor_unitario = 5155.52 / i.qtde_solicitada
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE i.id = v_item AND g.contrato_id = c_contrato AND d.codigo = '3.1.4';
  INSERT INTO itens_solicitacao_fat_direto
    (solicitacao_id, tarefa_id, detalhamento_id, descricao, local, qtde_solicitada, valor_unitario)
  SELECT c_p895, d.tarefa_id, d.id, d.descricao, 'TORRE', 1, 3533.33
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = c_contrato AND d.codigo = '3.1.15';

  -- 4. #1081: 17.2.1 → 17.1.1
  UPDATE itens_solicitacao_fat_direto i
     SET detalhamento_id = d.id, tarefa_id = d.tarefa_id
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE i.solicitacao_id = c_p1081
     AND i.detalhamento_id = (SELECT d2.id FROM detalhamentos d2
                                JOIN tarefas t2      ON t2.id = d2.tarefa_id
                                JOIN grupos_macro g2 ON g2.id = t2.grupo_macro_id
                               WHERE g2.contrato_id = c_contrato AND d2.codigo = '17.2.1')
     AND g.contrato_id = c_contrato AND d.codigo = '17.1.1';
  IF NOT FOUND THEN RAISE EXCEPTION '#1081 sem o item 17.2.1'; END IF;

  -- 5. Soma dos itens = valor do pedido (nada de dinheiro novo)
  FOR r IN
    SELECT * FROM (VALUES (c_p20, 188740.23), (c_p895, 8688.85), (c_p1081, 5932.09)) AS x(id, total)
  LOOP
    SELECT SUM(valor_total) INTO v_total FROM itens_solicitacao_fat_direto WHERE solicitacao_id = r.id;
    IF abs(v_total - r.total) > 0.02 THEN
      RAISE EXCEPTION 'Pedido %: soma dos itens % ≠ %', r.id, v_total, r.total;
    END IF;
  END LOOP;

  UPDATE solicitacoes_fat_direto
     SET observacoes = COALESCE(observacoes, '') || v_nota
   WHERE id IN (c_p20, c_p895, c_p1081);

  RAISE NOTICE 'OK: #20, #895 e #1081 realocados';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado: #20 = 1.1.1 1903.44 · 1.11.1 12673.44 · 1.13.1 32751.20 ·
--   1.3.1 71305.95 · 1.4.1 5261.84 · 1.5.1 14837.15 · 1.6.1 11735.88 ·
--   1.9.1 3002.34 · 2.2.1 35268.99 · #895 = 3.1.15 3533.33 · 3.1.4 5155.52 ·
--   #1081 = 17.1.1 5932.09
-- ===========================================================================
SELECT s.numero, d.codigo, i.valor_total
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN detalhamentos d           ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id IN ('34eebb0f-1363-4abf-a2b7-d55e31c11f51',
                            '50a25075-3ada-46a4-ade3-74d9a230d3b9',
                            '78a4f728-fa76-494a-8438-151c7b48fa63')
 ORDER BY s.numero, d.codigo;
