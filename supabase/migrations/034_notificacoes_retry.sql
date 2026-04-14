-- ============================================================
-- 034 — Retry de notificações por email (P1.7)
-- ============================================================
-- Hoje, se Resend está fora ou retorna erro, o email é simplesmente
-- perdido. Só fica um log do erro. Isso quebra o fluxo de aprovação
-- (operador não recebe email de medição submetida).
--
-- Solução: gravar o PAYLOAD da notificação na tabela ANTES de tentar
-- enviar. Se falhar, marca pra retry. Cron job processa pendentes.
-- ============================================================

ALTER TABLE notificacoes_log
  -- Payload completo pra reenviar sem reconstruir do zero
  ADD COLUMN IF NOT EXISTS payload          JSONB,
  -- Contagem e agendamento de retry (exponential backoff)
  ADD COLUMN IF NOT EXISTS tentativas       INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proximo_retry_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultimo_erro      TEXT;

-- Index pra cron job ler rapidamente o que precisa reprocessar
CREATE INDEX IF NOT EXISTS idx_notif_pendente
  ON notificacoes_log(proximo_retry_em)
  WHERE status_envio IN ('pendente', 'falhou')
    AND tentativas < 5;

COMMENT ON COLUMN notificacoes_log.payload IS
  'Payload completo (to, cc, subject, html) pra reenviar sem reconstruir.';
COMMENT ON COLUMN notificacoes_log.tentativas IS
  'Quantas vezes o envio foi tentado. Após 5, marca como falhou definitivo.';
COMMENT ON COLUMN notificacoes_log.proximo_retry_em IS
  'Próxima janela de tentativa. Backoff exponencial: 1min → 5min → 15min → 1h → 6h.';
