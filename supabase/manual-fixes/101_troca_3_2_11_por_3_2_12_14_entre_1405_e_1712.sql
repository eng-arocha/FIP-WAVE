-- ---------------------------------------------------------------------------
-- 101 — Troca de alocação 3.2.11 ↔ 3.2.12/13/14 entre os pedidos 1405 e 1712
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Decisão do Alex (03/11/2026): o cabo do pedido 1405 (já 100% faturado) não
-- foi só para o pavimento tipo — cobertura, rooftop e casa de máquinas já
-- estão com o material 100% na obra. Se faltar material, o saldo sai pelo
-- pavto tipo; se sobrar depois de executar todos os tipos, vira faturamento
-- de material FIP no padrão normal.
--
-- Os dois pedidos são do mesmo fornecedor (CORDEIRO CABOS ELETRICOS S.A.).
-- Troca, sem dinheiro novo:
--   #1405 (9ae7bfc3…) 3.2.11 458.836,79 → 154.741,44
--                     + 3.2.12 44.719,57 · 3.2.13 49.315,84 · 3.2.14 210.059,94
--                     (as três linhas saem do #1712, mesmo id de item)
--   #1712 (028d49ff…) 3.2.11  73.033,91 → 377.129,26
--   Total movido: 304.095,35. Valor dos dois pedidos não muda.
--
-- Efeito esperado na tela (realizado de material = NF rateada pelos itens):
--   3.2.11  470.494,00 (86,6%) → ~166.398,6 (30,6%) · saldo 377.129,26 no #1712
--   3.2.12/13/14  0% → ~100% (centavos a menos: as NFs do #1405 somam 0,13
--   abaixo do pedido — diferença que já existia).
--
-- Impactos conferidos:
--   - Comprometido por item não muda (3.2.11 segue 543.528,00 = 100%; 12/13/14
--     seguem 100%). Teto do contrato não muda (trigger 028 nem dispara: valor
--     dos pedidos inalterado). Não há trigger em itens_solicitacao_fat_direto.
--   - Desconto de NF nas medições (074/079): grupo 3 apura por 'grupo', os 4
--     itens estão no mesmo balde → NF disponível do grupo idêntica. Já abatido
--     no 3.2.11 (MED-6 108.705,60 + MED-7 13.739,18 = 122.444,78) fica abaixo
--     da nova NF alocada (~166.398,6): nada fica negativo, nada é abatido 2x.
--   - Nenhuma medição em aberto; nenhum pedido pendente nesses itens;
--     nenhuma compensação de lastro nesses itens.
--   - #1712 ainda sem NF: a Cordeiro fatura por material, o rateio é interno.
--     Só o espelho de itens do #1712 no app muda (3.2.11 em vez de 12/13/14).
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: #1405 3.2.11 458836.79 · #1712 3.2.11 73033.91, 3.2.12 44719.57,
--           3.2.13 49315.84, 3.2.14 210059.94
-- ===========================================================================
SELECT s.numero, d.codigo, i.id, i.valor_total
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN detalhamentos d           ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id IN ('9ae7bfc3-b2d4-4094-8daa-9dd5c24425f4',
                            '028d49ff-4e1b-4115-b051-8f7890e0f064')
   AND d.codigo IN ('3.2.11', '3.2.12', '3.2.13', '3.2.14')
 ORDER BY s.numero, d.codigo;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_p1405    CONSTANT uuid := '9ae7bfc3-b2d4-4094-8daa-9dd5c24425f4';
  c_p1712    CONSTANT uuid := '028d49ff-4e1b-4115-b051-8f7890e0f064';
  c_i1405    CONSTANT uuid := '552ca7be-db83-48c2-b207-c0d84ada1ed8';  -- #1405 3.2.11
  c_i1712    CONSTANT uuid := '6777f39e-0190-45ec-ab57-7bacae98ff2c';  -- #1712 3.2.11
  c_movidos  CONSTANT uuid[] := ARRAY[
    '4dc49e9d-0be0-469c-bcda-55d6ad709096'::uuid,   -- 3.2.12
    '2473f2ea-aa60-47c7-be0f-0cf6730e14cc'::uuid,   -- 3.2.13
    '357f7278-025f-46b6-9374-4ff8a29d737c'::uuid];  -- 3.2.14
  v_nota     CONSTANT text := E'\n\nAjuste 03/11/2026 (manual-fix 101): 3.2.11 ↔ 3.2.12/13/14 trocados entre #1405 e #1712 (304.095,35) — material de cobertura, rooftop e casa de máquinas veio no #1405.';
  r          record;
  v_total    numeric;
  v_n        int;
BEGIN
  -- 0. Pedidos no estado esperado
  FOR r IN
    SELECT * FROM (VALUES (c_p1405, 752318.19), (c_p1712, 762315.59)) AS x(id, total)
  LOOP
    SELECT valor_total INTO v_total FROM solicitacoes_fat_direto
     WHERE id = r.id AND contrato_id = c_contrato AND status = 'aprovado' AND deletado_em IS NULL;
    IF v_total IS NULL OR abs(v_total - r.total) > 0.02 THEN
      RAISE EXCEPTION 'Pedido % com valor/status inesperado: %', r.id, v_total;
    END IF;
  END LOOP;

  -- 1. Itens no estado esperado
  PERFORM 1 FROM itens_solicitacao_fat_direto
   WHERE id = c_i1405 AND solicitacao_id = c_p1405 AND abs(valor_total - 458836.79) < 0.02;
  IF NOT FOUND THEN RAISE EXCEPTION '#1405 sem o item 3.2.11 de 458.836,79'; END IF;
  PERFORM 1 FROM itens_solicitacao_fat_direto
   WHERE id = c_i1712 AND solicitacao_id = c_p1712 AND abs(valor_total - 73033.91) < 0.02;
  IF NOT FOUND THEN RAISE EXCEPTION '#1712 sem o item 3.2.11 de 73.033,91'; END IF;
  SELECT count(*), SUM(valor_total) INTO v_n, v_total FROM itens_solicitacao_fat_direto
   WHERE id = ANY(c_movidos) AND solicitacao_id = c_p1712 AND COALESCE(valor_devolvido, 0) = 0;
  IF v_n <> 3 OR abs(v_total - 304095.35) > 0.02 THEN
    RAISE EXCEPTION '#1712: itens 3.2.12/13/14 inesperados (% itens, %)', v_n, v_total;
  END IF;

  -- 2. Troca
  UPDATE itens_solicitacao_fat_direto SET valor_unitario = 154741.44 / qtde_solicitada WHERE id = c_i1405;
  UPDATE itens_solicitacao_fat_direto SET valor_unitario = 377129.26 / qtde_solicitada WHERE id = c_i1712;
  UPDATE itens_solicitacao_fat_direto SET solicitacao_id = c_p1405 WHERE id = ANY(c_movidos);

  -- 3. Soma dos itens = valor do pedido (nada de dinheiro novo)
  FOR r IN
    SELECT * FROM (VALUES (c_p1405, 752318.19), (c_p1712, 762315.59)) AS x(id, total)
  LOOP
    SELECT SUM(valor_total) INTO v_total FROM itens_solicitacao_fat_direto WHERE solicitacao_id = r.id;
    IF abs(v_total - r.total) > 0.02 THEN
      RAISE EXCEPTION 'Pedido %: soma dos itens % ≠ %', r.id, v_total, r.total;
    END IF;
  END LOOP;

  UPDATE solicitacoes_fat_direto
     SET observacoes = COALESCE(observacoes, '') || v_nota
   WHERE id IN (c_p1405, c_p1712);

  RAISE NOTICE 'OK: #1405 e #1712 trocados (304.095,35)';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado: #1405 3.2.11 154741.44 · 3.2.12 44719.57 · 3.2.13 49315.84 ·
--           3.2.14 210059.94 · #1712 3.2.11 377129.26
-- ===========================================================================
SELECT s.numero, d.codigo, i.valor_total
  FROM itens_solicitacao_fat_direto i
  JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
  JOIN detalhamentos d           ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id IN ('9ae7bfc3-b2d4-4094-8daa-9dd5c24425f4',
                            '028d49ff-4e1b-4115-b051-8f7890e0f064')
   AND d.codigo IN ('3.2.11', '3.2.12', '3.2.13', '3.2.14')
 ORDER BY s.numero, d.codigo;
