-- ============================================================
-- 037 — Webhooks outbound (P2.6)
-- ============================================================
-- Permite que sistemas externos (ERP do cliente, BI, Slack via Zapier)
-- recebam eventos do FIP-WAVE em tempo real ao invés de polling.
--
-- Modelo:
--   webhook_subscriptions: configura URL + lista de eventos + secret HMAC
--   webhook_deliveries:    log de cada delivery (status, retry, response)
--
-- Eventos canônicos (compatíveis com `event` da audit_log):
--   - medicao.aprovada
--   - medicao.rejeitada
--   - solicitacao.aprovada
--   - solicitacao.rejeitada
--   - solicitacao.desaprovada
--   - nf_fat_direto.criada
--   - contrato.reajuste_aplicado
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Para escopo futuro multi-contrato: NULL = recebe de todos os contratos
  contrato_id     UUID REFERENCES contratos(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  url             TEXT NOT NULL CHECK (url ~* '^https?://'),
  -- Lista de eventos que dispara (NULL = todos)
  events          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Secret pra HMAC-SHA256 do payload (header X-FIP-Signature)
  secret          TEXT NOT NULL,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  criado_por      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_envio    TIMESTAMPTZ,
  ultimo_status   INT
);

CREATE INDEX IF NOT EXISTS idx_webhook_sub_ativo
  ON webhook_subscriptions(ativo) WHERE ativo = true;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         JSONB NOT NULL,
  -- Resposta da request
  status_code     INT,
  response_body   TEXT,
  duration_ms     INT,
  -- Retry tracking
  tentativa       INT NOT NULL DEFAULT 0,
  proximo_retry   TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'sucesso', 'falhou')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliv_pendente
  ON webhook_deliveries(proximo_retry) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_webhook_deliv_sub
  ON webhook_deliveries(subscription_id, created_at DESC);

ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS webhook_sub_admin ON webhook_subscriptions;
CREATE POLICY webhook_sub_admin ON webhook_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

DROP POLICY IF EXISTS webhook_deliv_admin ON webhook_deliveries;
CREATE POLICY webhook_deliv_admin ON webhook_deliveries
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

COMMENT ON TABLE webhook_subscriptions IS
  'Webhooks outbound configurados pelos admins. Disparados em eventos de domínio.';
COMMENT ON TABLE webhook_deliveries IS
  'Log de tentativas de entrega de cada webhook. Retry com backoff.';
