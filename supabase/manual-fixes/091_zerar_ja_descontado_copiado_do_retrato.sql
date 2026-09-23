-- 091 — Zera o "já descontado" que entrou como CÓPIA do "a descontar".
--
-- Causa: a colagem da grade do ERP terminou na coluna `Vlr. a Desc`, sem o par
-- `Qtd.Desc | Vlr.Desc`. Sobraram dois números na cauda da linha —
-- `Qtd.a Desc` (4 decimais) e `Vlr. a Desc` (2 decimais) — e neste ERP a
-- coluna Qtd. carrega VALOR EM REAIS, então são o mesmo número duas vezes.
-- Lidos como (a descontar, descontado), o retrato ficou com 187 de 248 notas
-- idênticas nas duas colunas e `total_descontado` um centavo acima do `total`
-- (a assinatura dos 4 decimais).
--
-- Efeito: a conferência nota a nota soma `a descontar + descontado` para saber
-- quanto a nota vale no ERP. Com a cópia, TODA nota passou a valer o dobro —
-- 196 divergências com "lá" exatamente 2× o "aqui".
--
-- Este script zera só o campo contaminado. O teto de lastro (`total`,
-- `valor_a_descontar`) NÃO é tocado: aquele valor está correto.
--
-- Zero aqui é ignorância honesta: a coluna não veio. Para ter de volta o que o
-- ERP já descontou, cole a grade completa — a partir do commit desta correção
-- o parser reconhece o caso e nem deixa a cópia entrar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — dry run. Lista os retratos que o critério pega, com a proporção de
-- notas idênticas. Espere ver só os de 2026-09-23. Se algum de 2026-08-26
-- aparecer, PARE e me avise antes do bloco 2.
WITH contagem AS (
  SELECT
    s.id,
    s.referencia,
    s.informado_em,
    s.total,
    s.total_descontado,
    count(n.id) FILTER (WHERE n.valor_a_descontar <> 0
                           OR n.valor_descontado  <> 0)        AS com_valor,
    count(n.id) FILTER (WHERE (n.valor_a_descontar <> 0 OR n.valor_descontado <> 0)
                          AND n.valor_a_descontar = n.valor_descontado) AS iguais
  FROM informakon_saldo_snapshots s
  JOIN informakon_saldo_notas n ON n.snapshot_id = s.id
  WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  GROUP BY s.id, s.referencia, s.informado_em, s.total, s.total_descontado
)
SELECT
  id, referencia, informado_em, total, total_descontado, com_valor, iguais,
  round(100.0 * iguais / nullif(com_valor, 0), 1) AS pct_iguais,
  (com_valor >= 4 AND iguais::numeric / nullif(com_valor, 0) >= 0.6) AS sera_corrigido
FROM contagem
ORDER BY referencia DESC, informado_em DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — correção. RODE OS TRÊS UPDATES DE UMA VEZ, nesta ordem: o critério
-- lê as notas, então as notas têm de ser as ÚLTIMAS a mudar. Rodar só parte
-- deixa o retrato inconsistente.

-- 2.1 — total do retrato
UPDATE informakon_saldo_snapshots s
SET total_descontado = 0
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND s.id IN (
    SELECT n.snapshot_id
    FROM informakon_saldo_notas n
    GROUP BY n.snapshot_id
    HAVING count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 4
       AND count(*) FILTER (WHERE (n.valor_a_descontar <> 0 OR n.valor_descontado <> 0)
                              AND n.valor_a_descontar = n.valor_descontado)::numeric
           / count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 0.6
  );

-- 2.2 — somatório por macro item
UPDATE informakon_saldo_linhas l
SET valor_descontado = 0
WHERE l.snapshot_id IN (
    SELECT s.id FROM informakon_saldo_snapshots s
    WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND s.id IN (
        SELECT n.snapshot_id
        FROM informakon_saldo_notas n
        GROUP BY n.snapshot_id
        HAVING count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 4
           AND count(*) FILTER (WHERE (n.valor_a_descontar <> 0 OR n.valor_descontado <> 0)
                                  AND n.valor_a_descontar = n.valor_descontado)::numeric
               / count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 0.6
      )
  );

-- 2.3 — nota a nota (POR ÚLTIMO)
UPDATE informakon_saldo_notas x
SET valor_descontado = 0
WHERE x.snapshot_id IN (
    SELECT s.id FROM informakon_saldo_snapshots s
    WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND s.id IN (
        SELECT n.snapshot_id
        FROM informakon_saldo_notas n
        GROUP BY n.snapshot_id
        HAVING count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 4
           AND count(*) FILTER (WHERE (n.valor_a_descontar <> 0 OR n.valor_descontado <> 0)
                                  AND n.valor_a_descontar = n.valor_descontado)::numeric
               / count(*) FILTER (WHERE n.valor_a_descontar <> 0 OR n.valor_descontado <> 0) >= 0.6
      )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — conferir. O retrato do topo deve ficar com total_descontado = 0,
-- notas_iguais = 0 e o `total` intocado em 3.842.945,24.
SELECT
  s.id,
  s.referencia,
  s.informado_em,
  s.total,
  s.total_descontado,
  count(n.id)                                                   AS notas,
  count(n.id) FILTER (WHERE n.valor_a_descontar = n.valor_descontado
                        AND n.valor_a_descontar <> 0)            AS notas_iguais
FROM informakon_saldo_snapshots s
LEFT JOIN informakon_saldo_notas n ON n.snapshot_id = s.id
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
GROUP BY s.id, s.referencia, s.informado_em, s.total, s.total_descontado
ORDER BY s.referencia DESC, s.informado_em DESC
LIMIT 5;
