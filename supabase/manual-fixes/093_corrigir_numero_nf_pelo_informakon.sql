-- ---------------------------------------------------------------------------
-- 093 — Corrigir o número de duas NFs pelo Informakon
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--
-- O PROBLEMA
--
-- A conferência nota a nota da medição acusava duas notas "não estão no
-- Informakon". Estão lá, com o mesmo valor e o mesmo fornecedor, mas com um
-- dígito diferente no número (relação de AR e retrato do saldo de 22/10/2026):
--
--   Pedido  Fornecedor                 Site     Informakon  Valor
--   1582    Intelli Ind. de Terminais  705425   705424      21.739,38
--   1630    M. A. Frota & Cia          244042   244052       2.471,70
--
-- A DECISÃO (usuário, 26/10/2026): o Informakon é o correto. O site passa a
-- usar o número do ERP.
--
-- Rode os blocos NA ORDEM. O bloco 1 só lê: deve mostrar exatamente 2 linhas,
-- uma por nota, com o número antigo. O bloco 2 só altera a linha que bater
-- pedido + número antigo + valor, e recusa se não forem exatamente 2.
-- Idempotente: rodado de novo, não acha nada para trocar e não faz nada.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- ===========================================================================
SELECT s.numero AS pedido, nf.id, nf.numero_nf, nf.emitente, nf.valor, nf.data_emissao, nf.status
  FROM notas_fiscais_fat_direto nf
  JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND regexp_replace(nf.numero_nf, '\D', '', 'g') IN ('705425', '705424', '244042', '244052')
 ORDER BY s.numero;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO.
-- ===========================================================================
DO $$
DECLARE
  alvo   CONSTANT jsonb := '[
    {"pedido": 1582, "de": "705425", "para": "705424", "valor": 21739.38},
    {"pedido": 1630, "de": "244042", "para": "244052", "valor": 2471.70}
  ]';
  achadas int;
  trocadas int;
BEGIN
  SELECT COUNT(*) INTO achadas
    FROM jsonb_array_elements(alvo) a
    JOIN solicitacoes_fat_direto s
      ON s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.numero = (a->>'pedido')::int
    JOIN notas_fiscais_fat_direto nf
      ON nf.solicitacao_id = s.id
     AND regexp_replace(nf.numero_nf, '\D', '', 'g') = a->>'de'
     AND ABS(nf.valor - (a->>'valor')::numeric) < 0.01;

  IF achadas = 0 THEN
    RAISE NOTICE '093: nada a trocar (já aplicado).';
    RETURN;
  END IF;
  IF achadas <> 2 THEN
    RAISE EXCEPTION '093: esperava 2 notas com o número antigo, achei %. Confira o bloco 1.', achadas;
  END IF;

  UPDATE notas_fiscais_fat_direto nf
     SET numero_nf = a->>'para'
    FROM jsonb_array_elements(alvo) a, solicitacoes_fat_direto s
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.numero = (a->>'pedido')::int
     AND nf.solicitacao_id = s.id
     AND regexp_replace(nf.numero_nf, '\D', '', 'g') = a->>'de'
     AND ABS(nf.valor - (a->>'valor')::numeric) < 0.01;
  GET DIAGNOSTICS trocadas = ROW_COUNT;
  RAISE NOTICE '093: % nota(s) corrigida(s).', trocadas;
END $$;
