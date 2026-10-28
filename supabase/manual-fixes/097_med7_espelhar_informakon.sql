-- ---------------------------------------------------------------------------
-- 097 — MED-007: o site passa a espelhar o que FOI lançado no Informakon
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição:  2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed (MED-007, Informakon nº 3451)
-- Pedido Wave de serviço nº 21: 7af9da4b-9b98-4dca-8dc0-0dea6644f167
--   NF nº 07 (R$ 449.761,62) cancelada no site em 28/10/2026 para reemissão.
--
-- O PROBLEMA
--
-- O site sugeriu 90,8530% no 1.3.1 (Painel de Média Tensão), cortando os
-- R$ 31.916,58 de material da MSF/Cordeiro que ainda não tinham nota no
-- Informakon. No Informakon o 1.3.1 foi lançado a 100%. Tela "Valores
-- Financeiros" da medição 3451:
--
--                                 site (096)       Informakon
--   Valor contratual lançado    1.802.300,29     1.834.551,81
--   (−) material fornecido      1.262.423,66     1.263.229,98
--   Valor da medição              539.876,63       571.321,83
--   (−) retenção 5%                90.115,01        91.727,59
--   (−) descontos diversos              0,00            33,70
--   NF Wave de serviço            449.761,62       479.560,54
--
-- De onde vêm os R$ 29.798,92:
--   1.3.1 a 100%: +31.916,58 lançado, −1.595,83 de retenção     +30.320,75
--   NF 228 da FIP descontada inteira (189.241,64; pedido 20 =
--     188.740,23)                                                    −501,41
--   Administração: NFs 2144/11/98/95 = 44.384,90 (site 44.080,00);
--     valor lançado ≈ +334,64, material +304,90, retenção −16,73     +13,01
--   Descontos diversos do Informakon                                 −33,70
--   Arredondamento do % com 3 casas                                   +0,27
--
-- Decisão do usuário (28/10/2026): vale o Informakon. A NF Wave foi
-- reemitida por R$ 479.560,54.
--
-- O QUE MUDA
--   1. medicoes: valor_total, material e retenção = tela do Informakon;
--      ajuste_material_anterior = 33,70 (descontos diversos). Resultado:
--      571.321,83 − 91.727,59 − 33,70 = 479.560,54.
--   2. livro-razão: +1.612,58 de crédito e de débito da MED-007 (saldo igual).
--   3. 1.3.1: snapshot volta a 320.380,45 (100% lançado — desfaz o 095).
--      Administração: snapshot 44.384,90 (as NFs que o Informakon abateu).
--   4. pedido nº 21 → 479.560,54, itens na mesma proporção.
--
-- O QUE FICA PARA A MED-008 (docs/DIVIDAS.md)
--   Os R$ 31.916,58 da MSF/Cordeiro foram pagos à Wave agora, como serviço.
--   Quando as notas entrarem no Informakon, são descontadas da MED-008 SEM %
--   (o 1.3.1 já está a 100%): ajuste_material_anterior = 31.916,58 na MED-008.
--   Os R$ 501,41 a mais da NF 228 ficaram só no total da medição — não foram
--   rateados por item.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: 1834216.90 | 1294340.27 | 90115.01 | 0 | 90115.01 | 90115.01 |
--           449761.62 | 449761.62 | 0 | 288463.87 | 44080.00
-- ===========================================================================
SELECT
  m.valor_total, m.valor_material_correspondente, m.valor_retencao_garantia,
  m.ajuste_material_anterior,
  (SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END), 0)
     FROM retencao_movimentos WHERE origem_id = m.id)                         AS credito,
  (SELECT COALESCE(SUM(CASE tipo WHEN 'debito' THEN valor WHEN 'reversao_debito' THEN -valor ELSE 0 END), 0)
     FROM retencao_movimentos WHERE origem_id = m.id)                         AS debito,
  (SELECT valor_total FROM solicitacoes_fat_direto
    WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                       AS pedido_valor,
  (SELECT SUM(valor_total) FROM itens_solicitacao_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')           AS soma_itens,
  (SELECT COUNT(*) FROM notas_fiscais_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167'
      AND status <> 'cancelada')                                              AS nfs_ativas,
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8')                       AS snap_131,
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = 'f8b55623-fdf2-4870-9231-a281adc4ef91')                       AS snap_adm
FROM medicoes m
WHERE m.id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid    := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_medicao  CONSTANT uuid    := '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';
  c_pedido   CONSTANT uuid    := '7af9da4b-9b98-4dca-8dc0-0dea6644f167';
  c_item_131 CONSTANT uuid    := '53154fda-03fd-40d9-8c02-07ee984fdfe8';
  c_item_adm CONSTANT uuid    := 'f8b55623-fdf2-4870-9231-a281adc4ef91';
  c_lancado  CONSTANT numeric := 1834551.81;
  c_material CONSTANT numeric := 1263229.98;
  c_retencao CONSTANT numeric := 91727.59;
  c_diversos CONSTANT numeric := 33.70;
  c_liquido  CONSTANT numeric := 479560.54;
  v_med      record;
  v_credito  numeric;
  v_debito   numeric;
  v_pedido   numeric;
  v_nfs      int;
  v_fator    numeric;
  v_soma     numeric;
  v_maior    uuid;
BEGIN
  SELECT valor_total, valor_material_correspondente, valor_retencao_garantia, ajuste_material_anterior
    INTO v_med FROM medicoes WHERE id = c_medicao;
  SELECT COALESCE(SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END), 0),
         COALESCE(SUM(CASE tipo WHEN 'debito'  THEN valor WHEN 'reversao_debito'  THEN -valor ELSE 0 END), 0)
    INTO v_credito, v_debito
    FROM retencao_movimentos WHERE origem_id = c_medicao;
  SELECT valor_total INTO v_pedido FROM solicitacoes_fat_direto WHERE id = c_pedido AND deletado_em IS NULL;
  SELECT COUNT(*) INTO v_nfs FROM notas_fiscais_fat_direto
   WHERE solicitacao_id = c_pedido AND status <> 'cancelada';

  IF abs(v_med.valor_total - 1834216.90) > 0.02
     OR abs(v_med.valor_material_correspondente - 1294340.27) > 0.02
     OR abs(v_med.valor_retencao_garantia - 90115.01) > 0.02
     OR v_med.ajuste_material_anterior <> 0 THEN
    RAISE EXCEPTION 'MED-007 com valores inesperados: %', v_med;
  END IF;
  IF abs(v_credito - 90115.01) > 0.02 OR abs(v_debito - 90115.01) > 0.02 THEN
    RAISE EXCEPTION 'Livro-razão da MED-007 inesperado: crédito %, débito %', v_credito, v_debito;
  END IF;
  IF v_nfs > 0 THEN
    RAISE EXCEPTION 'Pedido 21 tem NF ativa — cancele a NF de 449.761,62 antes.';
  END IF;
  IF v_pedido IS NULL OR abs(v_pedido - 449761.62) > 0.02 THEN
    RAISE EXCEPTION 'Pedido 21 com valor inesperado: %', v_pedido;
  END IF;

  -- 1. Totais congelados = tela "Valores Financeiros" do Informakon
  UPDATE medicoes
     SET valor_total                     = c_lancado,
         valor_material_correspondente   = c_material,
         valor_retencao_garantia         = c_retencao,
         ajuste_material_anterior        = c_diversos,
         ajuste_material_anterior_motivo = 'Descontos diversos lançados no Informakon (medição 3451)'
   WHERE id = c_medicao;

  -- 2. Livro-razão: crédito primeiro (sobe o saldo), depois o débito da NF.
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'credito', 'ajuste_manual', c_medicao, round(c_retencao - v_credito, 2),
    'MED-007: retenção do Informakon — 5% × R$ 1.834.551,81 (1.3.1 lançado a 100%) — manual-fix 097',
    NULL);
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'debito', 'ajuste_manual', c_medicao, round(c_retencao - v_debito, 2),
    'MED-007: retenção do Informakon descontada na NF Wave reemitida (R$ 479.560,54) — manual-fix 097',
    NULL);

  -- 3. Snapshot por item
  UPDATE medicao_itens SET nf_material_descontada = 320380.45
   WHERE id = c_item_131 AND medicao_id = c_medicao AND nf_material_descontada = 288463.87;
  IF NOT FOUND THEN RAISE EXCEPTION '1.3.1 com snapshot inesperado'; END IF;
  UPDATE medicao_itens SET nf_material_descontada = 44384.90
   WHERE id = c_item_adm AND medicao_id = c_medicao AND nf_material_descontada = 44080.00;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administração com snapshot inesperado'; END IF;

  -- 4. Pedido nº 21 pelo líquido do Informakon; resíduo de centavos no maior item.
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
         observacoes = observacoes || E'\n\nAjuste 28/10/2026 (manual-fix 097): valores do Informakon (medição 3451) — 1.3.1 lançado a 100%. Valor LÍQUIDO a emitir: R$ 479.560,54. NF nº 07 (R$ 449.761,62) cancelada.'
   WHERE id = c_pedido;

  RAISE NOTICE 'OK: MED-007 = Informakon, pedido 21 = 479.560,54';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado: 1834551.81 | 1263229.98 | 91727.59 | 33.70 | 91727.59 | 91727.59 |
--           479560.54 | 479560.54 | 320380.45 | 44384.90
-- ===========================================================================
SELECT
  m.valor_total, m.valor_material_correspondente, m.valor_retencao_garantia,
  m.ajuste_material_anterior,
  (SELECT SUM(CASE tipo WHEN 'credito' THEN valor WHEN 'reversao_credito' THEN -valor ELSE 0 END)
     FROM retencao_movimentos WHERE origem_id = m.id)                         AS credito,
  (SELECT SUM(CASE tipo WHEN 'debito' THEN valor WHEN 'reversao_debito' THEN -valor ELSE 0 END)
     FROM retencao_movimentos WHERE origem_id = m.id)                         AS debito,
  (SELECT valor_total FROM solicitacoes_fat_direto
    WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                       AS pedido_valor,
  (SELECT SUM(valor_total) FROM itens_solicitacao_fat_direto
    WHERE solicitacao_id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')           AS soma_itens,
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8')                       AS snap_131,
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = 'f8b55623-fdf2-4870-9231-a281adc4ef91')                       AS snap_adm
FROM medicoes m
WHERE m.id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';
