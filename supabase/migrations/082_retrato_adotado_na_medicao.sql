-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 082 — Retrato do Informakon adotado na medição
--
-- PROBLEMA
--
-- A coluna "% a lançar" assume que todo o "NF Desc." já está lançado no
-- Informakon quando o percentual é digitado. O painel de teto de realidade
-- (migrations 080/081) provou que a premissa falha: na medição 04 o boletim
-- mandava descontar R$ 56.593,86 a mais do que existe lançado lá.
--
-- Lançar assim libera esse valor para a Wave sem contrapartida. Pior: na
-- aprovação o boletim grava `nf_descontavel` em
-- `medicao_itens.nf_material_descontada` (migration 074), o saldo corrido que
-- diz "esta nota já foi abatida". Registrar um abatimento que o ERP não fez
-- tira a nota da fila para sempre — não é adiantamento, é vazamento.
--
-- SOLUÇÃO
--
-- Adotar explicitamente um retrato NA MEDIÇÃO. Com ele adotado, o boletim
-- reclassifica a parcela não lançada de "NF Desc." para uma terceira
-- categoria de Gap ("não lançada no ERP"):
--
--   • sai de `informakon_a_lancar` → o % cai exatamente na diferença e o ERP
--     não paga o que não vai descontar;
--   • sai de `nf_descontavel`      → a aprovação não marca a nota como
--     abatida, e ela volta na medição seguinte.
--
-- POR QUE EXPLÍCITO E NÃO AUTOMÁTICO
--
-- O retrato é um documento datado, colado à mão. Se o boletim seguisse
-- sempre o mais recente, colar um retrato novo mudaria retroativamente o
-- percentual de medições já fechadas, e um retrato vencido derrubaria o
-- percentual sem motivo. Gravando o snapshot adotado na medição, cada
-- medição carrega o retrato que ela de fato usou — e a decisão fica
-- auditável: dá para responder "com base em qual retrato este % foi
-- calculado".
--
-- NULL = não adotado = comportamento anterior, bit a bit. Toda medição que
-- já existe continua exatamente como está.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. O código é resiliente à ausência
-- da coluna (cai no comportamento anterior), então pode rodar antes ou
-- depois do deploy.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS informakon_snapshot_id UUID
    REFERENCES informakon_saldo_snapshots(id) ON DELETE SET NULL;

COMMENT ON COLUMN medicoes.informakon_snapshot_id IS
  'Retrato do saldo a descontar do Informakon adotado nesta medição. Quando preenchido, o boletim reclassifica de "NF Desc." para "não lançada no ERP" a parcela que o ERP não tem lançada, derrubando o "% a lançar" e mantendo a nota na fila para a medição seguinte. NULL = não adotado.';

CREATE INDEX IF NOT EXISTS idx_medicoes_informakon_snapshot
  ON medicoes (informakon_snapshot_id)
  WHERE informakon_snapshot_id IS NOT NULL;

-- Conferência
SELECT 'medicoes.informakon_snapshot_id' AS coluna,
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'medicoes'
                  AND column_name = 'informakon_snapshot_id') AS existe;
