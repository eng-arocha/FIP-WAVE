-- ============================================================
-- 036 — Boletim de medição assinado (P2.3)
-- ============================================================
-- Adiciona campos pra registrar a "assinatura digital" do boletim:
--   - boletim_hash:        SHA-256 hex do conteúdo canônico
--   - boletim_emitido_em:  timestamp da emissão (server-side)
--   - boletim_emitido_por: usuário que disparou a emissão
--
-- O hash permite verificar que um PDF que circula é mesmo o original
-- gerado pelo sistema. Endpoint público /verificar/[hash] exibe os
-- dados associados.
-- ============================================================

ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS boletim_hash         TEXT,
  ADD COLUMN IF NOT EXISTS boletim_emitido_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS boletim_emitido_por  UUID REFERENCES auth.users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medicoes_boletim_hash
  ON medicoes(boletim_hash)
  WHERE boletim_hash IS NOT NULL;

COMMENT ON COLUMN medicoes.boletim_hash IS
  'SHA-256 do conteúdo canônico do boletim. Usado em /verificar/[hash] pra checar integridade.';
