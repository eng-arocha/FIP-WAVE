-- ---------------------------------------------------------------------------
-- 086 — Corrigir o valor de três NFs do item 18.1.6 (ANEL INTERMEDIARIO - SPDA
-- 14º PAV), apontadas pela faixa "nota(s) com valor diferente entre o site e o
-- Informakon" do painel de conferência.
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Origem: conferência do usuário contra o Informakon, 28/08/2026.
--
-- O QUE CADA UMA É
--
--   NF 2185  — aqui 2.815,50 × lá 2.963,68. O ERP está certo; o site foi
--              digitado a menos. Diferença: +148,18.
--
--   NF 91    — aqui 13.500,00 × lá 29.500,00. Erro de digitação no site.
--              Diferença: +16.000,00.
--
--   NF 246647 — aqui 3.376,10 × lá 3.188,10. NÃO é divergência de valor: no
--              Informakon a compra foi lançada em DUAS notas, a 246647 de
--              3.188,10 mais a complementar NF-e 250685 de 188,00. Somadas dão
--              exatamente os nossos 3.376,10. O site tem a soma numa nota só.
--              Aqui só se reduz a 246647; a complementar 250685 deve ser
--              cadastrada pela tela /nf-fat-direto, que anexa o arquivo e
--              registra emitente e datas. RODAR OS DOIS PASSOS OU NENHUM: só o
--              UPDATE derruba o total do pedido em 188,00.
--
-- ATENÇÃO AO SALDO DO PEDIDO. `saldo = valor_total do pedido − Σ NFs`. A NF 91
-- sobe R$ 16.000; se o pedido dela não comportar, o saldo fica negativo e a
-- tela passa a acusar. O bloco 1 mostra isso ANTES de qualquer alteração.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- 1) DIAGNÓSTICO — rode primeiro e leia. Nada é alterado aqui.
--
-- `saldo_depois` é o que o pedido fica depois da correção. Negativo = a nota
-- passou a valer mais do que o pedido comporta, e aí a correção certa é no
-- pedido, não na nota.
-- ---------------------------------------------------------------------------
WITH alvo(numero, valor_novo) AS (
  VALUES ('2185', 2963.68::numeric),
         ('91',   29500.00::numeric),
         ('246647', 3188.10::numeric)
)
SELECT
  s.numero                                   AS pedido_fip,
  s.status                                   AS pedido_status,
  n.numero_nf,
  n.emitente,
  n.status                                   AS nf_status,
  n.valor                                    AS valor_hoje,
  a.valor_novo,
  ROUND(a.valor_novo - n.valor, 2)           AS diferenca,
  s.valor_total                              AS pedido_valor_total,
  ROUND(s.valor_total - COALESCE((
    SELECT SUM(x.valor) FROM notas_fiscais_fat_direto x
     WHERE x.solicitacao_id = s.id AND x.status <> 'rejeitada'
  ), 0), 2)                                  AS saldo_hoje,
  ROUND(s.valor_total - COALESCE((
    SELECT SUM(x.valor) FROM notas_fiscais_fat_direto x
     WHERE x.solicitacao_id = s.id AND x.status <> 'rejeitada'
  ), 0) - (a.valor_novo - n.valor), 2)       AS saldo_depois
FROM notas_fiscais_fat_direto n
JOIN solicitacoes_fat_direto s ON s.id = n.solicitacao_id
JOIN alvo a
  ON regexp_replace(n.numero_nf, '\D', '', 'g')::text
     = lpad(a.numero, length(regexp_replace(n.numero_nf, '\D', '', 'g')), '0')
  OR ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = a.numero
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND s.deletado_em IS NULL
ORDER BY n.numero_nf;


-- ---------------------------------------------------------------------------
-- 2) CORREÇÃO — só depois de conferir o bloco 1.
--
-- O casamento é pelo número normalizado (sem pontuação e sem zeros à
-- esquerda), a mesma regra da conferência em lib/informakon/conferir-notas.ts.
-- O contrato entra na cláusula para não pegar nota homônima de outra obra.
-- ---------------------------------------------------------------------------
BEGIN;

UPDATE notas_fiscais_fat_direto n
   SET valor = 2963.68
  FROM solicitacoes_fat_direto s
 WHERE s.id = n.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '2185';

UPDATE notas_fiscais_fat_direto n
   SET valor = 29500.00
  FROM solicitacoes_fat_direto s
 WHERE s.id = n.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '91';

-- 246647: só rode se for cadastrar a complementar 250685 (188,00) em seguida.
UPDATE notas_fiscais_fat_direto n
   SET valor = 3188.10
  FROM solicitacoes_fat_direto s
 WHERE s.id = n.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') = '246647';

COMMIT;


-- ---------------------------------------------------------------------------
-- 3) CONFERÊNCIA — as três devem sair com os valores do Informakon.
-- ---------------------------------------------------------------------------
SELECT s.numero AS pedido_fip, n.numero_nf, n.valor, n.status
  FROM notas_fiscais_fat_direto n
  JOIN solicitacoes_fat_direto s ON s.id = n.solicitacao_id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND ltrim(regexp_replace(n.numero_nf, '\D', '', 'g'), '0') IN ('2185', '91', '246647')
 ORDER BY n.numero_nf;
