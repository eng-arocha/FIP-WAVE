-- ---------------------------------------------------------------------------
-- 103 — Águas pluviais: realoca parte do 8.1.13 (tipo) para o pós-tipo
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Decisão do Alex (03/11/2026): o material de 1º pavimento, cobertura,
-- rooftop, casa de máquinas e heliponto já está 100% na obra e veio nos
-- pedidos lançados no 8.1.13. Se faltar material, o saldo sai pelo tipo;
-- se sobrar depois de executar os tipos, vira faturamento de material FIP.
--
-- Pedido #1235 (M. A. FROTA, cabd61e1…), 100% faturado (NF 440.000,00 =
-- pedido). Troca dentro do pedido, sem dinheiro novo:
--   8.1.13 Pavimento tipo   100.000,00 → 69.638,86
--   8.1.12 1º pavimento     +  8.494,96  (com os 4.000,00 do #1594 = 12.494,96)
--   8.1.14 Cobertura        +  6.247,48
--   8.1.15 Rooftop + mez.   +  6.247,48
--   8.1.16 Casa de máquina  +  6.247,48
--   8.1.17 Heliponto        +  3.123,74
--   Total movido: 30.361,14
--
-- Efeito na Visão Geral (Material):
--   - 8.1.12/14/15/16/17: Saldo a solicitar 0,00 e NF 100% (o pedido está
--     todo faturado, então a NF rateada acompanha o valor movido).
--   - 8.1.13: NF 124.285,96 (71,0%) → 93.924,82 (53,7%); comprado
--     124.230,96 → 93.869,82; Saldo a solicitar 50.643,44 → 81.004,58.
--   - FIP do 8.1.13 só é chamada quando o material medido acumulado passar
--     do comprado (hoje 27,7% medido × 53,7% comprado).
--
-- Impactos conferidos:
--   - Valor do pedido e NFs não mudam; teto do contrato (trigger 028) não
--     dispara; não há trigger em itens_solicitacao_fat_direto.
--   - Desconto da Wave (camada ①) é por item sobre o material medido e não
--     lê a alocação do pedido. Os pedidos de serviço da Wave não são tocados.
--   - Destinos com material medido 0% → aparecem "NF à frente do medido"
--     (há serviço a medir), coerente com o material já na obra.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater
-- (inclusive se já tiver sido rodado).
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: #1235 = 8.1.1 150000 · 8.1.13 100000 · 9.1.1 160000 · 9.1.13 30000;
--           livre (contratado − comprometido) = valor a mover em cada destino.
-- ===========================================================================
WITH det AS (
  SELECT d.id, d.codigo,
         COALESCE(NULLIF(d.subtotal_material, 0),
                  COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0)) AS limite
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
),
comprometido AS (
  SELECT i.detalhamento_id, SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)) AS valor
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status IN ('aprovado', 'aguardando_aprovacao')
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, '') <> 'wave_servico'
   GROUP BY i.detalhamento_id
)
SELECT 'atual' AS tipo, det.codigo, i.valor_total AS valor, NULL::numeric AS livre
  FROM itens_solicitacao_fat_direto i
  JOIN det ON det.id = i.detalhamento_id
 WHERE i.solicitacao_id = 'cabd61e1-8d32-4e36-a34c-fdc8a674a4be'
UNION ALL
SELECT 'destino', det.codigo, v.valor, round(det.limite - COALESCE(c.valor, 0), 2)
  FROM (VALUES ('8.1.12', 8494.96), ('8.1.14', 6247.48), ('8.1.15', 6247.48),
               ('8.1.16', 6247.48), ('8.1.17', 3123.74)) AS v(codigo, valor)
  JOIN det ON det.codigo = v.codigo
  LEFT JOIN comprometido c ON c.detalhamento_id = det.id
 ORDER BY 1, 2;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid    := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_p1235    CONSTANT uuid    := 'cabd61e1-8d32-4e36-a34c-fdc8a674a4be';
  c_i8113    CONSTANT uuid    := 'aee2b4e1-4c0a-4a2f-8057-193275895494';  -- #1235 8.1.13
  c_total    CONSTANT numeric := 440000.00;
  v_nota     CONSTANT text    := E'\n\nAjuste 03/11/2026 (manual-fix 103): 30.361,14 do 8.1.13 realocados para 8.1.12/14/15/16/17 — material do pós-tipo já na obra, veio neste pedido.';
  r          record;
  v_det      record;
  v_livre    numeric;
  v_total    numeric;
BEGIN
  -- 0. Pedido no estado esperado
  SELECT valor_total INTO v_total FROM solicitacoes_fat_direto
   WHERE id = c_p1235 AND contrato_id = c_contrato AND status = 'aprovado' AND deletado_em IS NULL;
  IF v_total IS NULL OR abs(v_total - c_total) > 0.02 THEN
    RAISE EXCEPTION '#1235 com valor/status inesperado: %', v_total;
  END IF;

  -- 1. Item de origem intacto (recusa se o script já rodou)
  PERFORM 1 FROM itens_solicitacao_fat_direto
   WHERE id = c_i8113 AND solicitacao_id = c_p1235 AND abs(valor_total - 100000) < 0.02
     AND COALESCE(valor_devolvido, 0) = 0;
  IF NOT FOUND THEN RAISE EXCEPTION '#1235 sem o item 8.1.13 de 100.000,00 (já rodado?)'; END IF;

  -- 2. Cada destino tem exatamente o saldo livre a receber
  FOR r IN
    SELECT * FROM (VALUES ('8.1.12', 8494.96), ('8.1.14', 6247.48), ('8.1.15', 6247.48),
                          ('8.1.16', 6247.48), ('8.1.17', 3123.74)) AS x(codigo, valor)
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
    IF abs(v_livre - r.valor) > 0.01 THEN
      RAISE EXCEPTION 'Item %: livre % ≠ a mover %', r.codigo, v_livre, r.valor;
    END IF;
  END LOOP;

  -- 3. Troca
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = 69638.86 / qtde_solicitada
   WHERE id = c_i8113;

  INSERT INTO itens_solicitacao_fat_direto
    (solicitacao_id, tarefa_id, detalhamento_id, descricao, local, qtde_solicitada, valor_unitario)
  SELECT c_p1235, d.tarefa_id, d.id, d.descricao, 'TORRE', 1, v.valor
    FROM (VALUES ('8.1.12', 8494.96), ('8.1.14', 6247.48), ('8.1.15', 6247.48),
                 ('8.1.16', 6247.48), ('8.1.17', 3123.74)) AS v(codigo, valor)
    JOIN detalhamentos d ON d.codigo = v.codigo
    JOIN tarefas t       ON t.id = d.tarefa_id
    JOIN grupos_macro g  ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = c_contrato;

  -- 4. Soma dos itens = valor do pedido (nada de dinheiro novo)
  SELECT SUM(valor_total) INTO v_total FROM itens_solicitacao_fat_direto WHERE solicitacao_id = c_p1235;
  IF abs(v_total - c_total) > 0.02 THEN
    RAISE EXCEPTION '#1235: soma dos itens % ≠ %', v_total, c_total;
  END IF;

  UPDATE solicitacoes_fat_direto
     SET observacoes = COALESCE(observacoes, '') || v_nota
   WHERE id = c_p1235;

  RAISE NOTICE 'OK: #1235 realocado (30.361,14 do 8.1.13 para o pós-tipo)';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado: 8.1.1 150000 · 8.1.12 8494.96 · 8.1.13 69638.86 · 8.1.14 6247.48 ·
--           8.1.15 6247.48 · 8.1.16 6247.48 · 8.1.17 3123.74 · 9.1.1 160000 ·
--           9.1.13 30000 (soma 440000)
-- ===========================================================================
SELECT d.codigo, i.valor_total
  FROM itens_solicitacao_fat_direto i
  JOIN detalhamentos d ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id = 'cabd61e1-8d32-4e36-a34c-fdc8a674a4be'
 ORDER BY string_to_array(d.codigo, '.')::int[];
