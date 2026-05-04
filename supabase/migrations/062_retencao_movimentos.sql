-- Migration 062 — Tabela de movimentos de retenção contratual.
--
-- Modelo: a cada medição aprovada, cria-se um CRÉDITO de retenção igual a
-- 5% × (material_medido + servico_medido). Quando a NF Wave de serviço é
-- emitida, abate-se um DÉBITO até o limite do saldo. Saldo residual no
-- final do contrato é pago via NF de retenção da Wave SPE.
--
-- Diferente de uma "snapshot por medição": aqui é um livro razão — cada
-- movimento (crédito/débito) é uma linha imutável, e o saldo atual é a
-- soma sinalizada. Permite rastrear histórico e reverter em casos de
-- aprovação desfeita.

CREATE TABLE IF NOT EXISTS retencao_movimentos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('credito', 'debito', 'reversao_credito', 'reversao_debito')),
  origem_tipo     TEXT NOT NULL CHECK (origem_tipo IN ('medicao_aprovada', 'nf_wave_emitida', 'ajuste_manual', 'pagamento_final', 'desfazer_aprovacao')),
  origem_id       UUID,
  valor           NUMERIC(15,2) NOT NULL CHECK (valor >= 0),
  saldo_apos      NUMERIC(15,2) NOT NULL,
  descricao       TEXT,
  criado_por_id   UUID REFERENCES perfis(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retencao_movimentos_contrato_data
  ON retencao_movimentos(contrato_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_retencao_movimentos_origem
  ON retencao_movimentos(origem_tipo, origem_id);

ALTER TABLE retencao_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retencao_movimentos_select ON retencao_movimentos;
CREATE POLICY retencao_movimentos_select ON retencao_movimentos
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE retencao_movimentos IS
  'Livro razão de retenção contratual por contrato. Crédito quando medição é aprovada (5% × mat+serv), débito quando NF Wave é emitida pelo líquido. Saldo = SUM(creditos) - SUM(debitos).';

-- Função atômica que calcula saldo, valida operação e insere o movimento.
-- Use SEMPRE essa função pra inserir — garante consistência via lock.
CREATE OR REPLACE FUNCTION aplicar_movimento_retencao(
  p_contrato_id   UUID,
  p_tipo          TEXT,
  p_origem_tipo   TEXT,
  p_origem_id     UUID,
  p_valor         NUMERIC,
  p_descricao     TEXT,
  p_criado_por    UUID
) RETURNS TABLE(movimento_id UUID, saldo_apos NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_saldo_atual NUMERIC;
  v_saldo_novo  NUMERIC;
  v_id          UUID;
BEGIN
  -- Lock no contrato pra serializar movimentos concorrentes
  PERFORM 1 FROM contratos WHERE id = p_contrato_id FOR UPDATE;

  -- Saldo = SUM(creditos + reversao_debito) - SUM(debitos + reversao_credito)
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('credito', 'reversao_debito') THEN valor
      WHEN tipo IN ('debito', 'reversao_credito') THEN -valor
      ELSE 0
    END
  ), 0) INTO v_saldo_atual
  FROM retencao_movimentos
  WHERE contrato_id = p_contrato_id;

  -- Calcula novo saldo
  IF p_tipo IN ('credito', 'reversao_debito') THEN
    v_saldo_novo := v_saldo_atual + p_valor;
  ELSIF p_tipo IN ('debito', 'reversao_credito') THEN
    -- Permite saldo zerar mas não ficar negativo
    IF p_valor > v_saldo_atual + 0.01 THEN  -- tolerância de 1 centavo
      RAISE EXCEPTION 'Tentativa de débito de R$ % com saldo atual R$ %', p_valor, v_saldo_atual;
    END IF;
    v_saldo_novo := v_saldo_atual - p_valor;
  ELSE
    RAISE EXCEPTION 'Tipo de movimento desconhecido: %', p_tipo;
  END IF;

  INSERT INTO retencao_movimentos
    (contrato_id, tipo, origem_tipo, origem_id, valor, saldo_apos, descricao, criado_por_id)
  VALUES
    (p_contrato_id, p_tipo, p_origem_tipo, p_origem_id, p_valor, v_saldo_novo, p_descricao, p_criado_por)
  RETURNING id INTO v_id;

  movimento_id := v_id;
  saldo_apos   := v_saldo_novo;
  RETURN NEXT;
END;
$func$;

REVOKE ALL ON FUNCTION aplicar_movimento_retencao(UUID, TEXT, TEXT, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aplicar_movimento_retencao(UUID, TEXT, TEXT, UUID, NUMERIC, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION aplicar_movimento_retencao IS
  'Insere movimento de retenção atomicamente. Lock no contrato evita race em medições concorrentes. Levanta exceção se débito > saldo atual (com tolerância de R$ 0,01).';
