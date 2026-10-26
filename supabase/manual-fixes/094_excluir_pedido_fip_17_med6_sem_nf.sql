-- ---------------------------------------------------------------------------
-- 094 — Excluir o pedido 17 (NF de material FIP da MED-006) que nunca foi emitido
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Pedido:   d16fbd62-d53b-4d53-94bf-4694b94fed4e (nº 17, FIP ENGENHARIA, R$ 192.522,69)
--
-- O PROBLEMA
--
-- A aprovação da MED-006 (30/09/2026) criou sozinha este pedido de "NF de
-- material FIP" com R$ 192.522,69. A FIP nunca emitiu essa nota: o material
-- FIP da MED-006 foi faturado de verdade no pedido 27 (NF 224, R$ 6.762,96).
--
-- Aprovado e sem nota, o pedido 17 aparece como "nota a caminho" no boletim e
-- ocupa R$ 192.522,69 de saldo a gastar em 1.5, 1.13, 2.2, 4.2, 14.2, 18.1 e
-- outros itens.
--
-- A DECISÃO (usuário, 26/10/2026): excluir o pedido.
--
-- Exclusão LÓGICA (deletado_em), não DELETE: todas as leituras do site já
-- ignoram pedido com deletado_em preenchido, e o registro fica para auditoria.
-- Para desfazer: UPDATE ... SET deletado_em = NULL no mesmo id.
--
-- Rode os blocos NA ORDEM. O bloco 1 só lê: deve mostrar 1 linha, status
-- aprovado, valor 192522.69, nfs = 0, deletado_em vazio. O bloco 2 recusa se
-- algo disso não bater. Idempotente.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- ===========================================================================
SELECT s.id, s.numero, s.fornecedor_razao_social, s.status, s.valor_total, s.deletado_em,
       (SELECT COUNT(*) FROM notas_fiscais_fat_direto nf WHERE nf.solicitacao_id = s.id) AS nfs,
       LEFT(s.observacoes, 80) AS observacoes
  FROM solicitacoes_fat_direto s
 WHERE s.id = 'd16fbd62-d53b-4d53-94bf-4694b94fed4e';


-- ===========================================================================
-- BLOCO 2 — EXCLUSÃO LÓGICA.
-- ===========================================================================
DO $$
DECLARE
  alvo CONSTANT uuid := 'd16fbd62-d53b-4d53-94bf-4694b94fed4e';
  ok   int;
  nfs  int;
BEGIN
  SELECT COUNT(*) INTO nfs FROM notas_fiscais_fat_direto WHERE solicitacao_id = alvo;
  IF nfs > 0 THEN
    RAISE EXCEPTION '094: o pedido tem % nota(s) lançada(s). Não excluo.', nfs;
  END IF;

  UPDATE solicitacoes_fat_direto
     SET deletado_em = NOW(),
         observacoes = COALESCE(observacoes, '')
           || E'\n[Excluído em 26/10/2026: NF nunca emitida. Material FIP da MED-006 faturado no pedido 27, NF 224, R$ 6.762,96.]'
   WHERE id = alvo
     AND contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND numero = 17
     AND ABS(valor_total - 192522.69) < 0.01
     AND deletado_em IS NULL;
  GET DIAGNOSTICS ok = ROW_COUNT;

  IF ok = 0 THEN
    RAISE NOTICE '094: nada a excluir (já excluído ou dados diferentes — confira o bloco 1).';
  ELSE
    RAISE NOTICE '094: pedido 17 excluído (lógico).';
  END IF;
END $$;
