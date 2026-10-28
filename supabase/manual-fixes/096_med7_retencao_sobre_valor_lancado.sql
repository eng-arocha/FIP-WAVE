-- ---------------------------------------------------------------------------
-- 096 — MED-007: retenção sobre o valor LANÇADO no Informakon
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição:  2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed (MED-007)
-- Pedido Wave de serviço nº 21: 7af9da4b-9b98-4dca-8dc0-0dea6644f167 (sem NF)
--
-- O PROBLEMA
--
-- O site retinha 5% sobre o EXECUTADO (material + serviço = 1.834.216,90).
-- O Informakon retém sobre o valor contratual LANÇADO — o % digitado lá
-- (serviço + desconto, já com o corte por falta de lastro = 1.802.300,29).
-- Decisão de 22/10/2026 (manual-fix 092): seguir o Informakon. Sem corte as
-- duas bases são iguais; na MED-007 o corte de R$ 31.916,58 do 1.3.1 abriu
-- R$ 1.595,83 de diferença. Código corrigido no mesmo commit.
--
--                             site antes      Informakon
--   Valor lançado            1.834.216,90    1.802.300,29
--   (−) material fornecido   1.294.340,27    1.262.423,66
--   Serviço (bruto)            539.876,63      539.876,63
--   (−) retenção 5%             91.710,84       90.115,01
--   NF Wave de serviço         448.165,79      449.761,62
--
-- O QUE MUDA
--   1. medicoes.valor_retencao_garantia  → 90.115,01
--   2. livro-razão: estorna a diferença do crédito e do débito da MED-007
--      (saldo da retenção continua o mesmo; só a medição fica com 90.115,01)
--   3. pedido nº 21 → 449.761,62, itens reajustados na mesma proporção
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: retencao_congelada ≈ 91710.84, credito e debito ≈ 91710.85,
-- pedido_valor = 448165.78, soma_itens = 448165.78, nfs_no_pedido = 0.
-- ===========================================================================
SELECT
  (SELECT valor_retencao_garantia FROM medicoes
    WHERE id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed')                   AS retencao_congelada,
  (SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END), 0)
     FROM retencao_movimentos
    WHERE origem_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed')             AS credito,
  (SELECT COALESCE(SUM(CASE tipo WHEN 'debito' THEN valor WHEN 'reversao_debito' THEN -valor ELSE 0 END), 0)
     FROM retencao_movimentos
    WHERE origem_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed')             AS debito,
  (SELECT valor_total FROM solicitacoes_fat_direto
    WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                   AS pedido_valor,
  (SELECT SUM(valor_total) FROM itens_solicitacao_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')       AS soma_itens,
  (SELECT COUNT(*) FROM itens_solicitacao_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')       AS qtd_itens,
  (SELECT COUNT(*) FROM notas_fiscais_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')       AS nfs_no_pedido;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid    := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_medicao  CONSTANT uuid    := '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';
  c_pedido   CONSTANT uuid    := '7af9da4b-9b98-4dca-8dc0-0dea6644f167';
  c_retencao CONSTANT numeric := 90115.01;
  c_liquido  CONSTANT numeric := 449761.62;
  v_credito  numeric;
  v_debito   numeric;
  v_pedido   numeric;
  v_nfs      int;
  v_fator    numeric;
  v_soma     numeric;
  v_maior    uuid;
BEGIN
  SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END), 0),
         COALESCE(SUM(CASE tipo WHEN 'debito'  THEN valor WHEN 'reversao_debito'  THEN -valor ELSE 0 END), 0)
    INTO v_credito, v_debito
    FROM retencao_movimentos WHERE origem_id = c_medicao;
  SELECT valor_total INTO v_pedido FROM solicitacoes_fat_direto WHERE id = c_pedido AND deletado_em IS NULL;
  SELECT COUNT(*) INTO v_nfs FROM notas_fiscais_fat_direto WHERE solicitacao_id = c_pedido;

  IF v_nfs > 0 THEN
    RAISE EXCEPTION 'Pedido 21 já tem NF lançada — não reajustar por SQL.';
  END IF;
  IF v_pedido IS NULL OR abs(v_pedido - 448165.78) > 0.02 THEN
    RAISE EXCEPTION 'Pedido 21 com valor inesperado: %', v_pedido;
  END IF;
  IF abs(v_credito - 91710.85) > 0.02 OR abs(v_debito - 91710.85) > 0.02 THEN
    RAISE EXCEPTION 'Livro-razão da MED-007 inesperado: crédito %, débito %', v_credito, v_debito;
  END IF;

  -- 1. Retenção congelada da medição
  UPDATE medicoes SET valor_retencao_garantia = c_retencao WHERE id = c_medicao;

  -- 2. Livro-razão: primeiro devolve o débito (sobe o saldo), depois estorna
  --    o crédito (desce o mesmo tanto). Saldo final inalterado.
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'reversao_debito', 'ajuste_manual', c_medicao, v_debito - c_retencao,
    'MED-007: retenção sobre o valor lançado no Informakon (1.802.300,29), não sobre o executado — manual-fix 096',
    NULL);
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'reversao_credito', 'ajuste_manual', c_medicao, v_credito - c_retencao,
    'MED-007: retenção sobre o valor lançado no Informakon (1.802.300,29), não sobre o executado — manual-fix 096',
    NULL);

  -- 3. Pedido nº 21 pelo novo líquido, itens na mesma proporção; o resíduo de
  --    centavos vai para o maior item.
  v_fator := c_liquido / v_pedido;
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = round(valor_unitario * v_fator, 2)
   WHERE solicitacao_id = c_pedido;
  SELECT SUM(valor_total) INTO v_soma FROM itens_solicitacao_fat_direto WHERE solicitacao_id = c_pedido;
  SELECT id INTO v_maior FROM itens_solicitacao_fat_direto
   WHERE solicitacao_id = c_pedido ORDER BY valor_total DESC LIMIT 1;
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = valor_unitario + (c_liquido - v_soma) / qtde_solicitada
   WHERE id = v_maior;
  UPDATE solicitacoes_fat_direto
     SET valor_total = c_liquido,
         observacoes = observacoes || E'\n\nAjuste 28/10/2026 (manual-fix 096): retenção recalculada sobre o valor lançado no Informakon — 5% × R$ 1.802.300,29 = R$ 90.115,01. Valor LÍQUIDO a emitir: R$ 449.761,62.'
   WHERE id = c_pedido;

  RAISE NOTICE 'OK: retenção 90.115,01, pedido 21 = 449.761,62';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA. Esperado: 90115.01 | 90115.01 | 90115.01 | 449761.62 | 449761.62
-- ===========================================================================
SELECT
  (SELECT valor_retencao_garantia FROM medicoes WHERE id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed') AS retencao_congelada,
  (SELECT SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END)
     FROM retencao_movimentos WHERE origem_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed')           AS credito,
  (SELECT SUM(CASE tipo WHEN 'debito' THEN valor WHEN 'reversao_debito' THEN -valor ELSE 0 END)
     FROM retencao_movimentos WHERE origem_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed')           AS debito,
  (SELECT valor_total FROM solicitacoes_fat_direto WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167') AS pedido_valor,
  (SELECT SUM(valor_total) FROM itens_solicitacao_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                              AS soma_itens;
