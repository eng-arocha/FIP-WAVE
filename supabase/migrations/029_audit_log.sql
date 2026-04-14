-- ============================================================
-- 029 — Audit log unificado
-- ============================================================
-- Tabela append-only que registra eventos sensíveis em toda a app:
-- aprovação/rejeição/desaprovação de medições e solicitações,
-- alterações de permissão, CRUD de contratos, etc.
--
-- Por que uma tabela separada (e não triggers genéricos):
--   - Controle da semântica do evento (nome, actor, target)
--   - Opcional registrar diff (before/after) só nas mudanças que importam
--   - Filtro/pesquisa eficiente por actor/target sem quebrar performance
--     das tabelas de domínio
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Quem: user_id do ator + snapshot de nome/email pra sobreviver à deleção
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_nome      TEXT,
  actor_email     TEXT,
  actor_ip        INET,
  actor_user_agent TEXT,
  -- O quê: evento canônico (ex: 'medicao.aprovada', 'permissao.alterada')
  event           TEXT NOT NULL,
  -- Onde: recurso-alvo
  entity_type     TEXT NOT NULL,   -- ex: 'medicao', 'solicitacao_fat_direto', 'usuario'
  entity_id       UUID,            -- id do recurso quando aplicável
  -- Estado: before/after em JSONB pra diff inspecionável sem schema rígido
  before          JSONB,
  after           JSONB,
  -- Contexto livre (razão, comentário, metadados da request)
  metadata        JSONB
);

-- Índices pros 3 padrões de consulta mais comuns:
--   1) histórico por ator  (quem fez o quê?)
--   2) histórico por entidade (o que aconteceu com esta medição?)
--   3) timeline por evento (quantas aprovações nos últimos 30 dias?)
CREATE INDEX IF NOT EXISTS idx_audit_actor       ON audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_time  ON audit_log(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created     ON audit_log(created_at DESC);

-- Append-only: bloqueia UPDATE/DELETE via RLS (service role ainda pode em
-- casos extraordinários, mas a regra geral é imutabilidade).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON audit_log;
CREATE POLICY audit_log_select ON audit_log
  FOR SELECT
  USING (
    -- Admin enxerga tudo; demais usuários só eventos de que são ator
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
    OR actor_id = auth.uid()
  );

DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (true); -- Inserts vêm via service role (helper audit())

-- Sem UPDATE/DELETE policies: default deny pra usuários autenticados.

COMMENT ON TABLE audit_log IS
  'Trilha de auditoria append-only. Popular via lib/api/audit.ts::audit(). Imutável exceto por service role.';
