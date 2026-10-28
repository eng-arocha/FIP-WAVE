-- ---------------------------------------------------------------------------
-- 099 — Pedido FIP #20 (MED-007): excedente do 1.3.1 vai para o 2.2.1
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Pedido #20: 34eebb0f-1363-4abf-a2b7-d55e31c11f51 (NF 228 da FIP, 189.241,64)
-- Depende do 098 (rodado e conferido em 28/10/2026).
--
-- Decisão do Alex (28/10/2026): os R$ 71.305,95 do #20 que ficaram acima do
-- contratado no 1.3.1 vão inteiros para o 2.2.1 (Painéis QTA do grupo
-- gerador PMUC):
--   - 2.2.1 tem 100% do serviço medido e R$ 100.759,72 de material sem
--     pedido; o #20 já fatura o 2.2.1 (35.268,99). Fica 106.574,94.
--   - 1.3.1 sai do #20 e fecha nos 320.380,45 contratados
--     (Novemp #1059 + #1085).
--   - Grupo 1 mantém R$ 22.013,94 livres (1.6.1, 1.11.1, 1.12.1).
--
-- PREMISSA CONFERIDA: pedidos aprovados sem NF continuam podendo receber
-- nota — a NF consome o saldo do PEDIDO, não o livre do item. No 2.2.1 o
-- #1085 tem 35.899,46 sem NF; depois deste ajuste o 2.2.1 ainda fica com
-- 29.453,77 livres.
--
-- CONFERIR NO INFORMAKON: a NF 228 deve estar lançada no macro item do grupo
-- gerador (2) ou só no total. Se o Informakon a tiver no grupo 1, o site e o
-- ERP divergem por grupo na conta "FIP precisa emitir" da MED-008.
--
-- SEM CONFLITO COM 097/098: snapshots da MED-007, pedido Wave nº 21 e o
-- desconto de material (camada ①) não leem a alocação dos itens do pedido.
-- Valor do pedido e NF não mudam.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: 1.3.1 71305.95 | 2.2.1 35268.99 | livre_221 100759.72
-- ===========================================================================
SELECT d.codigo, i.valor_total,
       CASE WHEN d.codigo = '2.2.1' THEN round(
         COALESCE(NULLIF(d.subtotal_material, 0),
                  COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0))
         - (SELECT COALESCE(SUM(i2.valor_total - COALESCE(i2.valor_devolvido, 0)), 0)
              FROM itens_solicitacao_fat_direto i2
              JOIN solicitacoes_fat_direto s2 ON s2.id = i2.solicitacao_id
             WHERE i2.detalhamento_id = d.id
               AND s2.status IN ('aprovado', 'aguardando_aprovacao')
               AND s2.deletado_em IS NULL
               AND COALESCE(s2.tipo, '') <> 'wave_servico'), 2)
       END AS livre_221
  FROM itens_solicitacao_fat_direto i
  JOIN detalhamentos d ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id = '34eebb0f-1363-4abf-a2b7-d55e31c11f51'
   AND d.codigo IN ('1.3.1', '2.2.1')
 ORDER BY d.codigo;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
DO $$
DECLARE
  c_contrato CONSTANT uuid    := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_p20      CONSTANT uuid    := '34eebb0f-1363-4abf-a2b7-d55e31c11f51';
  c_mover    CONSTANT numeric := 71305.95;
  v_item_131 uuid;
  v_item_221 uuid;
  v_det_221  record;
  v_livre    numeric;
  v_total    numeric;
BEGIN
  SELECT valor_total INTO v_total FROM solicitacoes_fat_direto
   WHERE id = c_p20 AND contrato_id = c_contrato AND status = 'aprovado' AND deletado_em IS NULL;
  IF v_total IS NULL OR abs(v_total - 188740.23) > 0.02 THEN
    RAISE EXCEPTION '#20 com valor/status inesperado: %', v_total;
  END IF;

  SELECT i.id INTO v_item_131
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.solicitacao_id = c_p20 AND d.codigo = '1.3.1' AND abs(i.valor_total - c_mover) < 0.02;
  IF v_item_131 IS NULL THEN RAISE EXCEPTION '#20 sem o item 1.3.1 de 71.305,95 (098 rodou?)'; END IF;

  SELECT i.id INTO v_item_221
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.solicitacao_id = c_p20 AND d.codigo = '2.2.1' AND abs(i.valor_total - 35268.99) < 0.02;
  IF v_item_221 IS NULL THEN RAISE EXCEPTION '#20 sem o item 2.2.1 de 35.268,99'; END IF;

  -- Saldo livre do 2.2.1 (mesma regra da trava do app)
  SELECT d.id,
         COALESCE(NULLIF(d.subtotal_material, 0),
                  COALESCE(d.quantidade_contratada, 0) * COALESCE(d.valor_material_unit, 0)) AS limite
    INTO v_det_221
    FROM detalhamentos d
    JOIN tarefas t      ON t.id = d.tarefa_id
    JOIN grupos_macro g ON g.id = t.grupo_macro_id
   WHERE g.contrato_id = c_contrato AND d.codigo = '2.2.1';
  SELECT v_det_221.limite - COALESCE(SUM(i.valor_total - COALESCE(i.valor_devolvido, 0)), 0)
    INTO v_livre
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
   WHERE i.detalhamento_id = v_det_221.id
     AND s.status IN ('aprovado', 'aguardando_aprovacao')
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, '') <> 'wave_servico';
  IF v_livre < c_mover - 0.01 THEN
    RAISE EXCEPTION '2.2.1 sem saldo: livre %, precisa %', v_livre, c_mover;
  END IF;

  -- Junta no item 2.2.1 já existente e tira o 1.3.1 do pedido
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = (35268.99 + c_mover) / qtde_solicitada
   WHERE id = v_item_221;
  DELETE FROM itens_solicitacao_fat_direto WHERE id = v_item_131;

  SELECT SUM(valor_total) INTO v_total FROM itens_solicitacao_fat_direto WHERE solicitacao_id = c_p20;
  IF abs(v_total - 188740.23) > 0.02 THEN
    RAISE EXCEPTION '#20: soma dos itens % ≠ 188.740,23', v_total;
  END IF;

  UPDATE solicitacoes_fat_direto
     SET observacoes = COALESCE(observacoes, '') ||
       E'\n\nAjuste 28/10/2026 (manual-fix 099): 71.305,95 do 1.3.1 (acima do contratado) movidos para o 2.2.1.'
   WHERE id = c_p20;

  RAISE NOTICE 'OK: #20 sem 1.3.1; 2.2.1 = 106.574,94';
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado (#20): 1.1.1 1903.44 · 1.11.1 12673.44 · 1.13.1 32751.20 ·
--   1.4.1 5261.84 · 1.5.1 14837.15 · 1.6.1 11735.88 · 1.9.1 3002.34 ·
--   2.2.1 106574.94 — total 188740.23, sem 1.3.1
-- ===========================================================================
SELECT d.codigo, i.valor_total,
       SUM(i.valor_total) OVER () AS total_pedido
  FROM itens_solicitacao_fat_direto i
  JOIN detalhamentos d ON d.id = i.detalhamento_id
 WHERE i.solicitacao_id = '34eebb0f-1363-4abf-a2b7-d55e31c11f51'
 ORDER BY d.codigo;
