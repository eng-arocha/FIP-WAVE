-- Migration 060: Fluxo de encerramento de saldo Fornecedor→Aprovador
-- + Confirmação "sem mais NF" item-a-item + Audit de revisão de medições
-- ----------------------------------------------------------------------
-- Resolve a questão de "saldo de pedido aprovado pendente de NF" que
-- nunca vai chegar:
--
-- 1. medicao_itens ganha 4 colunas pra registrar confirmação item-a-item
--    do aprovador ANTES de aprovar a medição (% serv. med. ajusta pra
--    % informakon quando confirmacao_sem_nf = true E retido > 0).
--
-- 2. solicitacoes_encerramento_saldo: tabela do fluxo formal
--    Fornecedor (Wave) solicita → FIP (aprovador) decide. Reusa
--    encerrarPedidoComDevolucao() (migration 050) quando aprovado.
--    Encerramento muda status do pedido pra 'encerrado' → automaticamente
--    sai do filtro 'aprovado' no cálculo do informakon → saldo_aprovado
--    cai → retido recalcula. Sem tabela tracker dedicada (fungibilidade
--    matemática é suficiente conforme decisão do user).
--
-- 3. medicoes_revisao_log: audit trail de "desfazer aprovação" (caso
--    em que medição foi aprovada por engano e nenhuma NF foi lançada
--    depois — permite reverter pra status submetido).

-- ============================================================
-- 1) Confirmação "sem NF" item-a-item
-- ============================================================

ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS confirmacao_sem_nf BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmacao_sem_nf_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmacao_sem_nf_por_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmacao_sem_nf_motivo TEXT;

COMMENT ON COLUMN medicao_itens.confirmacao_sem_nf IS
  'true quando o aprovador confirma que NÃO chega mais NF FIP material para este item antes de aprovar a medição. Faz % serv. med. = % informakon (proteção de retenção contratual).';
COMMENT ON COLUMN medicao_itens.confirmacao_sem_nf_motivo IS
  'Motivo da confirmação (default sugerido: "fornecedor confirmou que não emitirá mais NF — material concluído com NFs já lançadas"). Editável pelo aprovador.';

-- ============================================================
-- 2) Solicitações de encerramento de saldo (Fornecedor → Aprovador)
-- ============================================================

CREATE TABLE IF NOT EXISTS solicitacoes_encerramento_saldo (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitacao_fat_direto_id   UUID NOT NULL REFERENCES solicitacoes_fat_direto(id) ON DELETE CASCADE,
  medicao_origem_id           UUID REFERENCES medicoes(id) ON DELETE SET NULL,
  status                      TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'cancelada')),
  motivo_solicitacao          TEXT NOT NULL,
  motivo_rejeicao             TEXT,
  saldo_no_momento            NUMERIC(15,2) NOT NULL,
  saldo_efetivamente_cancelado NUMERIC(15,2),
  solicitado_por_id           UUID REFERENCES perfis(id) ON DELETE SET NULL,
  solicitado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decidido_por_id             UUID REFERENCES perfis(id) ON DELETE SET NULL,
  decidido_em                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enc_sol_solicitacao
  ON solicitacoes_encerramento_saldo(solicitacao_fat_direto_id);
CREATE INDEX IF NOT EXISTS idx_enc_sol_status
  ON solicitacoes_encerramento_saldo(status);
CREATE INDEX IF NOT EXISTS idx_enc_sol_pendentes
  ON solicitacoes_encerramento_saldo(solicitado_em DESC)
  WHERE status = 'pendente';

COMMENT ON TABLE solicitacoes_encerramento_saldo IS
  'Fluxo formal Fornecedor (Wave) → Aprovador (FIP) para encerrar saldo de pedido aprovado pendente de NF. Quando aprovada, dispara encerrarPedidoComDevolucao() da migration 050 e registra detalhamento_saldo_cancelado.';
COMMENT ON COLUMN solicitacoes_encerramento_saldo.saldo_no_momento IS
  'Snapshot do saldo do pedido (valor_total - soma NFs validadas) no momento da solicitação. Pode divergir do saldo_efetivamente_cancelado se NFs forem lançadas entre a solicitação e a decisão.';
COMMENT ON COLUMN solicitacoes_encerramento_saldo.saldo_efetivamente_cancelado IS
  'Valor efetivamente cancelado quando a aprovação foi processada (= saldo no momento da decisão). NULL enquanto pendente.';

-- ============================================================
-- 3) Audit de revisão de medições (desfazer aprovação)
-- ============================================================

CREATE TABLE IF NOT EXISTS medicoes_revisao_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicao_id      UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  status_anterior TEXT NOT NULL,
  status_novo     TEXT NOT NULL,
  acao            TEXT NOT NULL CHECK (acao IN ('desfazer_aprovacao', 'reaprovar', 'outro')),
  motivo          TEXT NOT NULL,
  revisado_por_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
  revisado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_med_revisao_medicao
  ON medicoes_revisao_log(medicao_id, revisado_em DESC);

COMMENT ON TABLE medicoes_revisao_log IS
  'Audit trail de revisões pós-aprovação. Permite "desfazer aprovação" SE nenhuma NF foi lançada após a aprovação — exige motivo. Cada reversão é registrada aqui.';
