-- ============================================================
-- 028 — Trigger de teto do valor_material_direto
-- ============================================================
-- Problema: o check de teto do contrato (valor_material_direto) hoje
-- é feito na aplicação com read-then-write. Dois aprovadores em paralelo
-- conseguem furar o teto (ambos leem o saldo, ambos aprovam).
--
-- Solução: trigger que roda em BEFORE UPDATE/INSERT em
-- solicitacoes_fat_direto e bloqueia a transição para status='aprovado'
-- se a soma dos aprovados ativos + esta solicitação exceder o teto.
--
-- Usa SELECT ... FOR UPDATE no contrato pra serializar transações
-- concorrentes, eliminando a race condition.
-- ============================================================

CREATE OR REPLACE FUNCTION check_teto_material_direto()
RETURNS TRIGGER AS $$
DECLARE
  teto          NUMERIC;
  total_aprovado NUMERIC;
  saldo_disponivel NUMERIC;
BEGIN
  -- Só checa na transição pra 'aprovado' (insert com status aprovado OU update que mude pra aprovado)
  IF NEW.status = 'aprovado' AND (
    TG_OP = 'INSERT' OR
    (TG_OP = 'UPDATE' AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.valor_total IS DISTINCT FROM NEW.valor_total))
  ) THEN
    -- Lock na linha do contrato durante esta transação
    SELECT valor_material_direto INTO teto
      FROM contratos
      WHERE id = NEW.contrato_id
      FOR UPDATE;

    IF teto IS NULL OR teto <= 0 THEN
      -- Contrato sem teto definido: não aplica restrição
      RETURN NEW;
    END IF;

    -- Soma dos outros aprovados ativos (exclui ela própria em caso de UPDATE)
    SELECT COALESCE(SUM(valor_total), 0) INTO total_aprovado
      FROM solicitacoes_fat_direto
      WHERE contrato_id = NEW.contrato_id
        AND status = 'aprovado'
        AND deletado_em IS NULL
        AND id <> NEW.id;

    saldo_disponivel := teto - total_aprovado;

    IF NEW.valor_total > saldo_disponivel THEN
      RAISE EXCEPTION
        'Teto de material direto excedido para o contrato %. Teto: R$ %, já aprovado: R$ %, saldo: R$ %, solicitado: R$ %.',
        NEW.contrato_id, teto, total_aprovado, saldo_disponivel, NEW.valor_total
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_teto_material_direto ON solicitacoes_fat_direto;

CREATE TRIGGER trg_check_teto_material_direto
  BEFORE INSERT OR UPDATE ON solicitacoes_fat_direto
  FOR EACH ROW
  EXECUTE FUNCTION check_teto_material_direto();

COMMENT ON FUNCTION check_teto_material_direto() IS
  'Bloqueia aprovação de solicitação fat-direto se somatório aprovado exceder valor_material_direto do contrato. Serializa via FOR UPDATE.';
