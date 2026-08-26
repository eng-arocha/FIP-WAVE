-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 079 — Nível de apuração da NF de material, por grupo macro
--
-- CONTEXTO
--
-- O desconto de NF de material é apurado num "balde": todos os itens do balde
-- somam material medido e nota alocada, a régua acumulada
-- MENOR(material acumulado, nota lançada) − já abatido é aplicada ao balde
-- inteiro, e o resultado volta a cada item por proporção.
--
-- O nível desse balde já mudou duas vezes:
--   v1  grupo macro  — espelhava o Informakon, que consolida a nota no macro
--                      item ("Faturamento direto - ÁGUA PLUVIAL").
--   v2  tarefa (29/07/2026) — porque o grupo 16 (SDAI) mistura
--                      "16.1 INFRA — eletrodutos" com "16.2 CABEAMENTO — cabo
--                      blindado", e nota de eletroduto passou a dar cabo por
--                      coberto. Aceitou-se divergir do Informakon de propósito.
--   v3  ESTA         — a divergência deliberada virou o problema principal:
--                      o Informakon lança nota a nota mas as consolida no
--                      MACRO GRUPO, e é só nesse nível que os dois lados têm
--                      número comparável. Apurar por tarefa garantia que os
--                      totais nunca fechassem.
--
-- O QUE ESTA MIGRATION FAZ
--
-- Torna o nível uma escolha POR GRUPO, com o macro grupo como padrão. Assim o
-- caso do grupo 16 pode ser tratado sozinho, sem arrastar os outros 17 grupos
-- de volta para a apuração restritiva — que era exatamente o custo da v2.
--
-- Para fixar um grupo em 'tarefa' (só faça isso onde o grupo mistura
-- materiais de naturezas realmente incompatíveis):
--
--   UPDATE grupos_macro SET nivel_apuracao_nf = 'tarefa'
--    WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND codigo = '16';
--
-- O código é resiliente: se esta migration não rodar, o padrão 'grupo' vale
-- do mesmo jeito (lib/db/desconto-transbordo.ts, NIVEL_APURACAO_PADRAO).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO block para a constraint.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE grupos_macro
  ADD COLUMN IF NOT EXISTS nivel_apuracao_nf TEXT NOT NULL DEFAULT 'grupo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.grupos_macro'::regclass
       AND conname  = 'nivel_apuracao_nf_valido'
  ) THEN
    ALTER TABLE grupos_macro
      ADD CONSTRAINT nivel_apuracao_nf_valido
      CHECK (nivel_apuracao_nf IN ('grupo', 'tarefa'));
  END IF;
END $$;

COMMENT ON COLUMN grupos_macro.nivel_apuracao_nf IS
  'Balde de apuração do desconto de NF de material: ''grupo'' (padrão, espelha o Informakon) ou ''tarefa'' (mais restritivo, para grupo que mistura materiais incompatíveis — ex.: 16 SDAI, infra x cabeamento).';

-- Conferência
SELECT codigo, nome, nivel_apuracao_nf
  FROM grupos_macro
 WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 ORDER BY LPAD(codigo, 3, '0');
