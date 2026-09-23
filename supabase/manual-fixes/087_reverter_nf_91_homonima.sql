-- ---------------------------------------------------------------------------
-- 087 — Reverter a NF 91 para R$ 13.500,00
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Desfaz parte do manual-fix 086, à luz da lista de entradas do Informakon
-- importada em 23/09/2026.
--
-- POR QUE O 086 ESTAVA ERRADO
--
-- O 086 subiu a NF 91 de 13.500,00 para 29.500,00 "para ficar igual ao
-- Informakon". A premissa era que o ERP mostrava a MESMA nota com outro valor.
-- A lista de entradas desmente: existem TRÊS notas numeradas 91 no centro de
-- custo, de fornecedores diferentes —
--
--     J MAURICIO DE VASCONCELOS SOUZA ............ 16.000,00
--     MARCELO SILVEIRA DE SIQUEIRA SERVIÇOS ...... 13.500,00
--     JOAO VICTOR VIEIRA CORREA COELHO ...........    650,00
--
-- e os R$ 29.500,00 da grade de faturamento direto são a SOMA das duas
-- primeiras: 16.000,00 + 13.500,00. Não é uma nota de 29.500,00.
--
-- O nosso cadastro já tinha as duas. Ao subir a do Marcelo para 29.500,00, o
-- total do número 91 virou 45.500,00 — que é exatamente o que a conciliação
-- agora acusa contra os 29.500,00 do ERP. Sobra de R$ 16.000,00.
--
-- A RAIZ: o de-para entre os dois lados usa só os DÍGITOS do número da nota.
-- Em nota de serviço de número baixo isso colide muito — no mesmo centro de
-- custo há quatro fornecedores com nota "6" e seis com nota "10". Sem o nome
-- do fornecedor, número igual não significa nota igual.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1) DIAGNÓSTICO — confirme que existem duas notas 91 e que uma está em
--    29.500,00. Nada é alterado aqui.
-- ---------------------------------------------------------------------------
SELECT s.numero AS pedido_fip, n.id, n.numero_nf, n.emitente, n.valor, n.status,
       n.data_emissao
  FROM notas_fiscais_fat_direto n
  JOIN solicitacoes_fat_direto s ON s.id = n.solicitacao_id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '91'
 ORDER BY n.valor DESC;


-- ---------------------------------------------------------------------------
-- 2) REVERSÃO — só a nota que está em 29.500,00 volta para 13.500,00.
--    A de 16.000,00 (J Maurício) fica como está: ela é legítima.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE notas_fiscais_fat_direto n
   SET valor = 13500.00
  FROM solicitacoes_fat_direto s
 WHERE s.id = n.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '91'
   AND n.valor = 29500.00;

COMMIT;


-- ---------------------------------------------------------------------------
-- 3) CONFERÊNCIA — a soma do número 91 deve dar 29.500,00 + 650,00 conforme
--    o que estiver cadastrado, e nunca mais 45.500,00.
-- ---------------------------------------------------------------------------
SELECT ROUND(SUM(n.valor), 2) AS total_numero_91, COUNT(*) AS qtd_notas
  FROM notas_fiscais_fat_direto n
  JOIN solicitacoes_fat_direto s ON s.id = n.solicitacao_id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '91';
