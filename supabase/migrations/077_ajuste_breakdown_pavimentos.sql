-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 077 — Auditoria de ajuste de BREAKDOWN (pavimento / vão / mês)
--
-- Contexto: o admin passa a poder editar, numa medição pendente, o % de UMA
-- célula do breakdown (ex.: item 16.1.11 "INFRA SDAI - PAV TIPO ( 1° AO 36°
-- PAV )", 12º pavto de 90% → 50%) em vez de só a quantidade agregada do item.
--
-- Dois efeitos na tabela de auditoria `medicao_item_ajustes` (migration 061):
--
--  1) Guardar o retrato do breakdown antes/depois. Sem isso o histórico só
--     mostra "0,9 → 0,5" e ninguém descobre QUAL pavimento mudou.
--
--  2) Relaxar a CHECK `qty_distintas`. Um ajuste de breakdown pode manter a
--     quantidade TOTAL e ainda assim ser uma correção real — ex.: 12º pav
--     90%→50% junto com 13º pav 50%→90%. Com a CHECK antiga esse ajuste era
--     rejeitado pelo banco e sumia do histórico.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO block que só cria a constraint
-- se ela ainda não existir. Roda em branco se a migration 061 não foi
-- aplicada (o bloco inteiro é condicionado à existência da tabela).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'medicao_item_ajustes'
  ) THEN
    RAISE NOTICE 'medicao_item_ajustes não existe (migration 061 pendente) — skip 077';
    RETURN;
  END IF;

  -- 1) Retrato do breakdown antes/depois do ajuste.
  ALTER TABLE medicao_item_ajustes
    ADD COLUMN IF NOT EXISTS pavimentos_pct_anterior JSONB,
    ADD COLUMN IF NOT EXISTS pavimentos_pct_nova     JSONB;

  COMMENT ON COLUMN medicao_item_ajustes.pavimentos_pct_anterior IS
    'Retrato de medicao_itens.pavimentos_pct ANTES do ajuste. NULL = ajuste de quantidade agregada (sem breakdown).';
  COMMENT ON COLUMN medicao_item_ajustes.pavimentos_pct_nova IS
    'Retrato de medicao_itens.pavimentos_pct DEPOIS do ajuste. NULL = ajuste de quantidade agregada (sem breakdown).';

  -- 2) Troca a CHECK antiga por uma que aceita ajuste de breakdown com
  --    quantidade total inalterada.
  ALTER TABLE medicao_item_ajustes DROP CONSTRAINT IF EXISTS qty_distintas;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.medicao_item_ajustes'::regclass
       AND conname  = 'qty_distintas_ou_breakdown'
  ) THEN
    ALTER TABLE medicao_item_ajustes
      ADD CONSTRAINT qty_distintas_ou_breakdown CHECK (
        quantidade_anterior <> quantidade_nova
        OR pavimentos_pct_nova IS NOT NULL
      );
  END IF;

  RAISE NOTICE 'MIGRATION 077 CONCLUÍDA';
END $$;

-- Conferência
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'medicao_item_ajustes'
   AND column_name IN ('pavimentos_pct_anterior', 'pavimentos_pct_nova');
