-- ============================================================
-- Migration 073 — Fluxo de medição em DOIS PORTÕES
-- ============================================================
-- Contexto (FIP-WAVE / Condomínio Wave):
-- A aprovação da medição passa a ser dividida em dois momentos:
--
--   Portão 1 — AUTORIZAR (submetido/em_analise → autorizado)
--     A equipe avalia se os serviços foram executados conforme e
--     LIBERA somente a NF de MATERIAL FIP (faturamento direto).
--     A FIP emite a NF de material e lança no Informakon.
--
--   Portão 2 — APROVAR EMISSÃO NF SERVIÇO (autorizado → aprovado)
--     Só é liberado DEPOIS que a NF de material foi lançada no
--     sistema (pré-requisito p/ retenção). Aí sim libera a NF de
--     SERVIÇO da Wave (valor líquido após retenção).
--
-- Esta migration é IDEMPOTENTE — pode rodar mais de uma vez.
-- O código é resiliente à sua ausência (fallbacks por coluna).
-- ============================================================

-- 1) Novo status 'autorizado' no CHECK da tabela medicoes
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'medicoes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%submetido%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE medicoes DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE medicoes
    ADD CONSTRAINT medicoes_status_check CHECK (status IN (
      'rascunho', 'submetido', 'em_analise',
      'autorizado',                 -- portão 1 concluído (material liberado)
      'aprovado', 'rejeitado', 'cancelado'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- constraint já existe com o nome novo
END $$;

-- 2) Colunas de auditoria do portão 1 (autorização)
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS data_autorizacao   TIMESTAMPTZ;
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS autorizado_por_id  UUID REFERENCES perfis(id);
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS autorizado_por_nome VARCHAR(255);

-- 3) Vínculo da medição ao pedido FIP de MATERIAL que a cobre.
--    Usado para:
--      (a) rastrear qual solicitação de material foi gerada/escolhida
--          no portão 1;
--      (b) o caso FIP-0017: quando o fornecedor cria um pedido de
--          faturamento direto AVULSO, vinculamos esse pedido existente
--          à medição em vez de criar um novo rascunho duplicado.
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS material_fat_direto_id UUID
  REFERENCES solicitacoes_fat_direto(id) ON DELETE SET NULL;

-- Marca se o material desta medição foi coberto por um pedido
-- faturamento-direto AVULSO/EXTERNO (ex.: FIP-0017) em vez do canal
-- automático. Apenas informativo/auditoria.
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS material_via_pedido_avulso BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN medicoes.material_fat_direto_id IS
  'Pedido FIP de material (solicitacoes_fat_direto) que cobre o material desta medição. NULL quando não há material ou ainda não vinculado.';
COMMENT ON COLUMN medicoes.material_via_pedido_avulso IS
  'TRUE quando o material foi coberto por pedido fat-direto avulso/externo (ex.: FIP-0017) em vez do rascunho automático do portão 1.';

CREATE INDEX IF NOT EXISTS idx_medicoes_material_fat_direto
  ON medicoes(material_fat_direto_id);

-- 4) Novo valor 'autorizado' no CHECK de aprovacoes.acao (trilha de auditoria
--    do portão 1). Idempotente.
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'aprovacoes'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%acao%solicitou_ajuste%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE aprovacoes DROP CONSTRAINT %I', v_constraint);
  END IF;

  ALTER TABLE aprovacoes
    ADD CONSTRAINT aprovacoes_acao_check CHECK (acao IN (
      'aprovado', 'rejeitado', 'solicitou_ajuste', 'comentou', 'autorizado'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
