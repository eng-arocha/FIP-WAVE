-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 074 — Desconto de NF de material: só as notas da medição
--
-- Contexto (apuração da medição 004/2026-07 do WAVE):
--
--   DEFEITO 1 — A NF de SERVIÇO da Wave era contada como NF de MATERIAL.
--     A aprovação da medição cria o pedido da NF de serviço da Wave dentro
--     de `solicitacoes_fat_direto` (a mesma tabela dos pedidos de material).
--     `criarSolicitacaoRascunhoDeMedicao` recebia `tipo: 'wave_servico'` mas
--     não gravava esse tipo em coluna nenhuma, e o cálculo do boletim somava
--     todos os pedidos aprovados sem distinguir. Impacto medido no WAVE:
--     R$ 390.251,16 de NF de serviço entrando no desconto de material.
--
--   DEFEITO 2 — A mesma NF era descontável em TODA medição seguinte.
--     O rateio usava o acumulado do contrato e não havia registro do que já
--     tinha sido abatido, então uma NF de março voltava a ser descontável em
--     abril, maio, junho...
--
-- Correções desta migration:
--   1) `solicitacoes_fat_direto.tipo` — classifica o pedido e tira a NF de
--      serviço da Wave da conta de material. Backfill pelo CNPJ.
--   2) `medicao_itens.nf_material_descontada` — snapshot do quanto de NF de
--      material foi abatido naquele item naquela medição. Vira saldo corrido:
--      cada NF é descontável uma única vez ao longo das medições.
--   3) `medicoes.ajuste_material_anterior` — ajuste explícito e auditável
--      para compensar material faturado a mais em medições anteriores. É o
--      único caminho legítimo para o líquido divergir de
--      (serviço − retenção), porque o desconto é travado no material medido
--      e nunca pode passar dele.
--
-- IDEMPOTENTE: ADD COLUMN IF NOT EXISTS + backfills com guarda.
-- O código é resiliente à ausência destas colunas (cai no comportamento
-- anterior), então pode rodar antes ou depois do deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1) TIPO DO PEDIDO
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'material_fornecedor';

COMMENT ON COLUMN solicitacoes_fat_direto.tipo IS
  'Natureza do pedido: material_fornecedor (compra direta de fornecedor), fip_material (NF de material da FIP) ou wave_servico (NF de serviço da Wave, criada na aprovação da medição). Apenas material_fornecedor e fip_material entram no desconto de material do boletim.';

-- Backfill ANTES do CHECK, senão a constraint falha nas linhas antigas.
-- Wave Instalações SPE — NF de SERVIÇO (nunca desconta material).
UPDATE solicitacoes_fat_direto
   SET tipo = 'wave_servico'
 WHERE tipo <> 'wave_servico'
   AND (
     fornecedor_cnpj = '65.528.046/0001-23'
     OR UPPER(COALESCE(fornecedor_razao_social, '')) LIKE 'WAVE INSTALACOES SPE%'
   );

-- FIP Engenharia Elétrica — NF de MATERIAL da FIP (desconta material).
UPDATE solicitacoes_fat_direto
   SET tipo = 'fip_material'
 WHERE tipo NOT IN ('fip_material', 'wave_servico')
   AND (
     fornecedor_cnpj = '26.736.376/0001-52'
     OR UPPER(COALESCE(fornecedor_razao_social, '')) LIKE 'FIP ENGENHARIA EL%'
   );

DO $$
BEGIN
  ALTER TABLE solicitacoes_fat_direto
    ADD CONSTRAINT solicitacoes_fat_direto_tipo_check
    CHECK (tipo IN ('material_fornecedor', 'fip_material', 'wave_servico'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_fat_direto_tipo
  ON solicitacoes_fat_direto(contrato_id, tipo)
  WHERE deletado_em IS NULL;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) SNAPSHOT DO ABATIMENTO POR ITEM (saldo corrido)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS nf_material_descontada NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN medicao_itens.nf_material_descontada IS
  'Snapshot de quanto de NF de material foi abatido neste item nesta medição. Congelado na aprovação. A NF disponível de uma medição = NF emitida no item − SOMA desta coluna nas medições aprovadas anteriores, garantindo que cada nota seja descontada uma única vez.';

-- Backfill das medições JÁ APROVADAS, fiel à fórmula que estava em produção
-- na época — MIN(material do item, NF alocada no item) — mas já excluindo a
-- NF de serviço da Wave. Sem isso o saldo corrido começaria zerado e as
-- notas das medições 1..N voltariam a ser descontáveis.
WITH nf_por_det AS (
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
    WHERE s.status = 'aprovado'
      AND s.deletado_em IS NULL
      AND s.tipo <> 'wave_servico'
  ) s ON s.id = i.solicitacao_id
  WHERE i.detalhamento_id IS NOT NULL
  GROUP BY i.detalhamento_id
),
calc AS (
  SELECT
    mi.id,
    LEAST(
      mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
      COALESCE(n.nf_alocada, 0)
    ) AS valor
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN medicoes m      ON m.id = mi.medicao_id
  LEFT JOIN nf_por_det n ON n.detalhamento_id = mi.detalhamento_id
  WHERE m.status = 'aprovado'
    AND mi.nf_material_descontada = 0   -- guarda de idempotência
)
UPDATE medicao_itens mi
   SET nf_material_descontada = ROUND(GREATEST(c.valor, 0), 2)
  FROM calc c
 WHERE c.id = mi.id
   AND c.valor > 0;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) AJUSTE EXPLÍCITO DE MATERIAL DE MEDIÇÕES ANTERIORES
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS ajuste_material_anterior NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS ajuste_material_anterior_motivo TEXT;

COMMENT ON COLUMN medicoes.ajuste_material_anterior IS
  'Compensação, em R$, de material faturado a mais em medições anteriores, abatida do líquido da NF de serviço desta medição. Positivo reduz o líquido. Como o desconto de NF é travado no material medido, este é o único caminho auditável para o líquido divergir de (serviço − retenção).';

COMMENT ON COLUMN medicoes.ajuste_material_anterior_motivo IS
  'Justificativa do ajuste — qual NF de qual período está sendo compensada.';


-- ───────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────────────────────
SELECT tipo, COUNT(*) AS pedidos, ROUND(SUM(valor_total), 2) AS valor
  FROM solicitacoes_fat_direto
 WHERE deletado_em IS NULL
 GROUP BY tipo
 ORDER BY tipo;

SELECT m.numero, m.status,
       ROUND(SUM(mi.nf_material_descontada), 2) AS nf_material_descontada
  FROM medicoes m
  JOIN medicao_itens mi ON mi.medicao_id = m.id
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 GROUP BY m.numero, m.status
 ORDER BY m.numero;
