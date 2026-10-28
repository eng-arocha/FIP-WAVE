-- ---------------------------------------------------------------------------
-- 100 — Pedido FIP #20 = NF 228 (+ R$ 501,41 no 2.2.1)
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Pedido #20: 34eebb0f-1363-4abf-a2b7-d55e31c11f51 · NF 228 = 189.241,64
-- Depende do 099 (rodado e conferido em 28/10/2026).
--
-- O PROBLEMA
--   A NF 228 (189.241,64) é R$ 501,41 maior que o pedido #20 (188.740,23). A
--   NF é rateada pelos itens do pedido na proporção do valor, então cada item
--   recebe um pouco a mais do que o próprio pedido: aparecem negativos
--   pequenos em todos os itens do #20 (1.13.1 −87,01; 1.11.1 −33,67;
--   1.5.1 −39,42; 1.6.1 −31,18; 1.4.1 −13,98; 1.9.1 −7,98; 1.1.1 −5,06).
--
-- A CORREÇÃO (decisão do Alex, 28/10/2026)
--   Mesmo efeito do "ajuste de saldo por divergência" do app: o pedido sobe
--   o excedente da NF. O acréscimo vai no 2.2.1 (29.453,77 livres). Com
--   pedido = NF, o rateio fecha item a item e os negativos somem.
--
--   Os R$ 33,70 de "descontos diversos" da MED-007 NÃO entram aqui: é um
--   desconto da NF Wave no nível da medição (manual-fix 097), não material de
--   item — não mexe em saldo de nenhum item.
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- BLOCO 1 — PRÉVIA. Esperado: 188740.23 | 189241.64 | 106574.94
SELECT s.valor_total AS pedido,
       (SELECT SUM(valor) FROM notas_fiscais_fat_direto
         WHERE solicitacao_id = s.id AND status <> 'cancelada') AS nfs,
       (SELECT i.valor_total FROM itens_solicitacao_fat_direto i
          JOIN detalhamentos d ON d.id = i.detalhamento_id
         WHERE i.solicitacao_id = s.id AND d.codigo = '2.2.1') AS item_221
  FROM solicitacoes_fat_direto s
 WHERE s.id = '34eebb0f-1363-4abf-a2b7-d55e31c11f51';


-- BLOCO 2 — CORREÇÃO
DO $$
DECLARE
  c_p20   CONSTANT uuid    := '34eebb0f-1363-4abf-a2b7-d55e31c11f51';
  c_extra CONSTANT numeric := 501.41;
  v_ped   numeric;
  v_nfs   numeric;
  v_item  uuid;
BEGIN
  SELECT valor_total INTO v_ped FROM solicitacoes_fat_direto
   WHERE id = c_p20 AND status = 'aprovado' AND deletado_em IS NULL;
  SELECT SUM(valor) INTO v_nfs FROM notas_fiscais_fat_direto
   WHERE solicitacao_id = c_p20 AND status <> 'cancelada';
  IF v_ped IS NULL OR abs(v_ped - 188740.23) > 0.02 OR abs(v_nfs - 189241.64) > 0.02 THEN
    RAISE EXCEPTION '#20 inesperado: pedido %, NFs %', v_ped, v_nfs;
  END IF;

  SELECT i.id INTO v_item
    FROM itens_solicitacao_fat_direto i
    JOIN detalhamentos d ON d.id = i.detalhamento_id
   WHERE i.solicitacao_id = c_p20 AND d.codigo = '2.2.1' AND abs(i.valor_total - 106574.94) < 0.02;
  IF v_item IS NULL THEN RAISE EXCEPTION '#20 sem o 2.2.1 de 106.574,94 (099 rodou?)'; END IF;

  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = valor_unitario + c_extra / qtde_solicitada
   WHERE id = v_item;
  UPDATE solicitacoes_fat_direto
     SET valor_total = v_nfs,
         observacoes = COALESCE(observacoes, '') ||
           E'\n\nAjuste 28/10/2026 (manual-fix 100): +501,41 no 2.2.1 — pedido igualado à NF 228 (189.241,64).'
   WHERE id = c_p20;

  RAISE NOTICE 'OK: #20 = 189.241,64 = NF 228';
END $$;


-- BLOCO 3 — CONFERÊNCIA. Esperado: 189241.64 | 189241.64 | 107076.35
SELECT s.valor_total AS pedido,
       (SELECT SUM(valor_total) FROM itens_solicitacao_fat_direto WHERE solicitacao_id = s.id) AS soma_itens,
       (SELECT i.valor_total FROM itens_solicitacao_fat_direto i
          JOIN detalhamentos d ON d.id = i.detalhamento_id
         WHERE i.solicitacao_id = s.id AND d.codigo = '2.2.1') AS item_221
  FROM solicitacoes_fat_direto s
 WHERE s.id = '34eebb0f-1363-4abf-a2b7-d55e31c11f51';
