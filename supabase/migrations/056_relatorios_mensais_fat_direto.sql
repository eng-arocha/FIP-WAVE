-- Migration 056: Relatórios mensais de pedidos fat-direto atrasados
-- ----------------------------------------------------------------------
-- Tabela que registra um snapshot mensal por contrato com a lista de
-- pedidos com saldo pendente há mais de 30 dias. Geração idempotente:
-- 1 relatório por (contrato, ano, mes). Permite rastrear cobrança
-- recorrente (sequencia_cobranca) — quantos relatórios um pedido já
-- apareceu, pra escalar tom do email.

CREATE TABLE IF NOT EXISTS relatorios_mensais_fat_direto (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Snapshot dos pedidos atrasados no momento da geração (jsonb pra evitar
  -- perda de info se pedidos forem encerrados depois).
  pedidos_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  qtd_pedidos INTEGER NOT NULL DEFAULT 0,
  valor_total_atrasado NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'descartado')),
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em TIMESTAMPTZ,
  enviado_por_id UUID REFERENCES perfis(id),
  destinatarios_emails TEXT[],
  observacao TEXT,
  -- Cobrança recorrente: quantos relatórios anteriores tinham >=1 pedido
  -- em comum com este. 1 = primeira cobrança, 2 = reincidência, etc.
  sequencia_cobranca INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contrato_id, ano, mes)
);

CREATE INDEX IF NOT EXISTS idx_relatorios_mensais_status
  ON relatorios_mensais_fat_direto(status);
CREATE INDEX IF NOT EXISTS idx_relatorios_mensais_contrato_ano_mes
  ON relatorios_mensais_fat_direto(contrato_id, ano DESC, mes DESC);

COMMENT ON TABLE relatorios_mensais_fat_direto IS
  'Relatório mensal de pedidos fat-direto com saldo pendente há > 30 dias. 1 registro por (contrato, ano, mes) — idempotente. Status pendente vira enviado quando o gestor revisa e dispara o email.';
COMMENT ON COLUMN relatorios_mensais_fat_direto.pedidos_snapshot IS
  'jsonb array: [{id, numero_pedido_fip, data_aprovacao, valor_total, total_nfs, saldo, dias_decorridos}, ...]';
COMMENT ON COLUMN relatorios_mensais_fat_direto.sequencia_cobranca IS
  '1 = primeira cobrança desses pedidos; 2 = aparecem em outro relatório anterior do mesmo contrato; 3+ = recorrência. Usado pra escalar o tom do email.';
