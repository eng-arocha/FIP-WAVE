-- ═══════════════════════════════════════════════════════════════════════════
-- 075 — Medição 6 do WAVE: (A) renumerar para 004 e (B) apurar o desconto de NF
--
--   contrato : aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (WAVE)
--   medição  : a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8  (nº 6, submetido, 2026-07)
--
-- Estado após a correção dos 6 itens (boletim conferido):
--   material medido ... R$ 413.071,59
--   serviço medido .... R$ 392.448,69
--   total ............. R$ 805.520,27   (espelho: 805.522,67 — Δ 2,40 de arredondamento)
--   retenção 5% ....... R$  40.276,01   (espelho: 40.276,13)
--
-- Divergência remanescente = R$ 11.541,44
--   desconto do espelho .. R$ 424.613,03
--   material medido ...... R$ 413.071,59
--   ────────────────────────────────────
--   NF de material abatida ACIMA do material medido nesta medição.
--
-- O BLOCO B descobre a natureza desses R$ 11.541,44:
--   • se o material medido ACUMULADO cobre a NF → é NF de medição anterior
--     que não foi abatida na época (o abatimento do espelho está certo);
--   • se a NF passa do material acumulado → é material faturado adiantado
--     / saldo de pedido a chegar (o abatimento foi antecipado).
--
-- Blocos A e B são independentes. O A altera dado; o B é só SELECT.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO A1 — CONFERIR a numeração antes de mexer (só SELECT)
-- A hipótese: o Beno criou rascunhos (nº 4 e 5), simulou e apagou. Como
-- lib/db/medicoes.ts numera com MAX(numero) + 1, os números queimaram e esta
-- virou a 6. Rode isto primeiro e confira se 4 está realmente livre.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  m.numero,
  m.status,
  m.periodo_referencia,
  m.valor_total,
  m.data_submissao,
  m.data_aprovacao,
  m.solicitante_nome,
  (SELECT COUNT(*) FROM medicao_itens mi WHERE mi.medicao_id = m.id) AS qtd_itens,
  m.id
FROM medicoes m
WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
ORDER BY m.numero;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO A2 — RENUMERAR 6 → 4
-- Só executa se o número 4 estiver livre neste contrato (medicoes tem
-- UNIQUE(contrato_id, numero), então o guard evita erro).
-- ───────────────────────────────────────────────────────────────────────────
BEGIN;

DO $ren$
DECLARE
  v_medicao  uuid := 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8';
  v_contrato uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_novo     int  := 4;
  v_atual    int;
  v_ocupado  int;
BEGIN
  SELECT numero INTO v_atual FROM medicoes WHERE id = v_medicao;
  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'Medicao % nao encontrada.', v_medicao;
  END IF;

  IF v_atual = v_novo THEN
    RAISE NOTICE 'Medicao ja esta com numero % — nada a fazer.', v_novo;
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_ocupado
    FROM medicoes
   WHERE contrato_id = v_contrato AND numero = v_novo;

  IF v_ocupado > 0 THEN
    RAISE EXCEPTION 'Numero % ja esta ocupado neste contrato — nao renumerei. Rode o BLOCO A1 e decida.', v_novo;
  END IF;

  UPDATE medicoes SET numero = v_novo WHERE id = v_medicao;
  RAISE NOTICE 'Medicao renumerada: % → %', v_atual, v_novo;
END $ren$;

-- Conferência
SELECT numero, status, periodo_referencia, valor_total
  FROM medicoes
 WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 ORDER BY numero;

-- Confira acima → COMMIT;   se estranhar → ROLLBACK;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO B1 — PEDIDOS FIP × NFs LANÇADAS (só SELECT)
-- Mostra, pedido por pedido, quanto foi aprovado e quanto de NF entrou.
-- `saldo_sem_nf` = pedido aprovado ainda SEM nota emitida ("saldo a chegar").
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  s.numero_pedido_fip,
  s.status,
  s.fornecedor_razao_social,
  s.valor_total                                       AS valor_pedido,
  COALESCE(SUM(nf.valor), 0)                          AS total_nfs,
  s.valor_total - COALESCE(SUM(nf.valor), 0)          AS saldo_sem_nf,
  STRING_AGG(
    nf.numero_nf || ': ' || nf.valor || ' (' || nf.data_emissao || ')',
    ' | ' ORDER BY nf.data_emissao
  )                                                   AS nfs
FROM solicitacoes_fat_direto s
LEFT JOIN notas_fiscais_fat_direto nf ON nf.solicitacao_id = s.id
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND s.deletado_em IS NULL
GROUP BY s.id, s.numero_pedido_fip, s.status, s.fornecedor_razao_social, s.valor_total
ORDER BY s.numero_pedido_fip;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO B2 — O TESTE QUE DECIDE: NF alocada × material medido ACUMULADO
-- Compara, por item, o total de NF de material já emitida com o material
-- medido somando TODAS as medições aprovadas + esta.
--   excedente > 0  →  NF emitida ACIMA do executado acumulado (adiantada)
--   excedente <= 0 →  NF coberta pelo executado (só não foi abatida antes)
-- A soma da coluna `excedente_sobre_acumulado` é o que precisa explicar os
-- R$ 11.541,44.
-- ───────────────────────────────────────────────────────────────────────────
WITH medicoes_validas AS (
  SELECT id FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (status = 'aprovado' OR id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
),
material_acum AS (
  SELECT
    mi.detalhamento_id,
    SUM(mi.quantidade_medida) AS qtd_acum
  FROM medicao_itens mi
  WHERE mi.medicao_id IN (SELECT id FROM medicoes_validas)
  GROUP BY mi.detalhamento_id
),
nf_por_det AS (
  SELECT
    i.detalhamento_id,
    SUM(i.valor_total / NULLIF(s.total_itens, 0) * s.total_nfs) AS nf_alocada
  FROM itens_solicitacao_fat_direto i
  JOIN (
    SELECT
      s.id,
      (SELECT COALESCE(SUM(ii.valor_total), 0)
         FROM itens_solicitacao_fat_direto ii
        WHERE ii.solicitacao_id = s.id
          AND ii.detalhamento_id IS NOT NULL) AS total_itens,
      (SELECT COALESCE(SUM(nf.valor), 0)
         FROM notas_fiscais_fat_direto nf
        WHERE nf.solicitacao_id = s.id)       AS total_nfs
    FROM solicitacoes_fat_direto s
    WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND s.status = 'aprovado'
      AND s.deletado_em IS NULL
  ) s ON s.id = i.solicitacao_id
  WHERE i.detalhamento_id IS NOT NULL
  GROUP BY i.detalhamento_id
)
SELECT
  d.codigo,
  SUBSTR(d.descricao, 1, 45)                                      AS descricao,
  ROUND(ma.qtd_acum, 6)                                           AS qtd_acumulada,
  d.quantidade_contratada                                         AS qtd_contratada,
  ROUND((ma.qtd_acum * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                                  AS material_acumulado,
  ROUND(COALESCE(n.nf_alocada, 0)::numeric, 2)                    AS nf_alocada,
  ROUND((COALESCE(n.nf_alocada, 0)
         - ma.qtd_acum * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                                  AS excedente_sobre_acumulado
FROM material_acum ma
JOIN detalhamentos d ON d.id = ma.detalhamento_id
LEFT JOIN nf_por_det n ON n.detalhamento_id = ma.detalhamento_id
WHERE COALESCE(n.nf_alocada, 0) > 0
ORDER BY excedente_sobre_acumulado DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOCO B3 — TOTAIS DO TESTE B2 (uma linha só, pra fechar a conta)
-- ───────────────────────────────────────────────────────────────────────────
WITH medicoes_validas AS (
  SELECT id FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (status = 'aprovado' OR id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
),
material_acum AS (
  SELECT mi.detalhamento_id, SUM(mi.quantidade_medida) AS qtd_acum
  FROM medicao_itens mi
  WHERE mi.medicao_id IN (SELECT id FROM medicoes_validas)
  GROUP BY mi.detalhamento_id
),
nf_total AS (
  SELECT COALESCE(SUM(nf.valor), 0) AS total
  FROM notas_fiscais_fat_direto nf
  JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
  WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND s.status = 'aprovado'
    AND s.deletado_em IS NULL
)
SELECT
  ROUND(SUM(ma.qtd_acum * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                     AS material_acumulado_contrato,
  (SELECT ROUND(total, 2) FROM nf_total)             AS nf_material_emitida_total,
  (SELECT ROUND(total, 2) FROM nf_total)
    - ROUND(SUM(ma.qtd_acum * COALESCE(d.valor_material_unit, 0))::numeric, 2)
                                                     AS nf_acima_do_acumulado,
  413071.59                                          AS material_medido_esta_medicao,
  424613.03                                          AS desconto_do_espelho,
  ROUND(424613.03 - 413071.59, 2)                    AS divergencia_a_explicar
FROM material_acum ma
JOIN detalhamentos d ON d.id = ma.detalhamento_id;
