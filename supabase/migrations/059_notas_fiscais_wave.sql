-- Migration 059: Notas fiscais emitidas pela Wave (lado do serviço)
-- ----------------------------------------------------------------------
-- Espelho de notas_fiscais_fat_direto, mas pro lado de serviço:
-- a Wave emite NF baseado em medições aprovadas. Esta tabela registra
-- esse lançamento pra que o dashboard possa calcular "Saldo Medição
-- Aprovado" (= medições aprovadas − NFs Wave já lançadas, zera quando
-- a NF é emitida).
--
-- Esquema esqueleto: a UI de cadastro fica pra entrega futura. Tabela
-- vazia inicialmente faz com que saldo_medicao_servico = realizado_servico
-- (medições aprovadas) — o que reflete o estado real do projeto até que
-- a Wave registre as NFs no sistema.

CREATE TABLE IF NOT EXISTS notas_fiscais_wave (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  -- Liga à medição que originou a NF. Permite múltiplas NFs por medição
  -- (NF parcial) ou agrupar várias medições numa só (NULL e usar valor manual).
  medicao_id      UUID REFERENCES medicoes(id) ON DELETE SET NULL,
  numero_nf       TEXT NOT NULL,
  emitente_cnpj   TEXT,
  emitente_nome   TEXT,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor > 0),
  data_emissao    DATE NOT NULL,
  url_arquivo     TEXT,
  observacao      TEXT,
  status          TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','validada','rejeitada','cancelada')),
  validado_por_id UUID REFERENCES perfis(id) ON DELETE SET NULL,
  validado_em     TIMESTAMPTZ,
  motivo_rejeicao TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id   UUID REFERENCES perfis(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nf_wave_contrato
  ON notas_fiscais_wave(contrato_id);
CREATE INDEX IF NOT EXISTS idx_nf_wave_medicao
  ON notas_fiscais_wave(medicao_id)
  WHERE medicao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nf_wave_status
  ON notas_fiscais_wave(status);

COMMENT ON TABLE notas_fiscais_wave IS
  'Notas fiscais emitidas pela Wave (lado serviço). Usada pelo dashboard pra calcular saldo_medicao_servico. UI de cadastro virá em entrega futura — tabela vazia faz saldo_medicao = realizado_servico.';
COMMENT ON COLUMN notas_fiscais_wave.medicao_id IS
  'Medição que originou a NF (NULL permite NFs avulsas que cobrem várias medições). Quando preenchido, o dashboard zera o saldo_medicao_servico daquele grupo proporcionalmente.';
COMMENT ON COLUMN notas_fiscais_wave.status IS
  'Lifecycle: pendente (lançada, aguardando validação) → validada (efetivamente computada) ou rejeitada/cancelada (não computa). Apenas validada e pendente entram na soma de "saldo abatido".';
