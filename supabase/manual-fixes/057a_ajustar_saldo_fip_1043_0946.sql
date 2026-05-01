-- One-shot retroativo: ajusta saldo dos pedidos FIP-1043 e FIP-0946
-- ----------------------------------------------------------------------
-- Esses pedidos receberam NFs cuja soma excedeu o valor_total aprovado
-- (saldo negativo). Conforme autorização do gestor (registrada por email),
-- o ajuste é aplicado incrementando o ÚNICO item existente do pedido —
-- ambos os pedidos têm um único item (18.1.14) com saldo no orçamento
-- global pra cobrir o incremento.
--
-- Estratégia (revisada — substitui versão anterior que criava item novo):
--   1. valor_total do pedido vira a soma das NFs (zera saldo negativo)
--   2. valor_aprovado_original recebe snapshot do valor pré-ajuste
--   3. ajustes_divergencia ganha entrada com tipo='ajuste_retroativo'
--   4. valor_unitario do único item é incrementado em (excedente / qtde)
--      — preserva qtde_solicitada porque a coluna valor_total do item é
--      GENERATED ALWAYS AS (qtde_solicitada * valor_unitario)
--
-- Pré-requisitos:
--   - Migration 057 aplicada (colunas valor_aprovado_original e
--     ajustes_divergencia existem em solicitacoes_fat_direto)
--   - Cada pedido (1043 e 946) tem exatamente 1 item — validado em runtime
--
-- Idempotência: depois do 1º run, excedente fica <= 0.01 → CONTINUE.
-- Pode ser rodado várias vezes sem efeito colateral.

DO $$
DECLARE
  pedido RECORD;
  excedente NUMERIC;
  qtd_itens INT;
  delta_unitario NUMERIC;
BEGIN
  FOR pedido IN
    SELECT s.id, s.numero_pedido_fip, s.valor_total,
           COALESCE(SUM(nf.valor) FILTER (WHERE nf.status != 'rejeitada'), 0) AS soma_nfs
      FROM solicitacoes_fat_direto s
      LEFT JOIN notas_fiscais_fat_direto nf ON nf.solicitacao_id = s.id
     WHERE s.numero_pedido_fip IN (1043, 946)
       AND s.deletado_em IS NULL
     GROUP BY s.id, s.numero_pedido_fip, s.valor_total
  LOOP
    excedente := pedido.soma_nfs - pedido.valor_total;

    IF excedente <= 0.01 THEN
      RAISE NOTICE 'PED-% sem divergência positiva (saldo OK) — pulando',
        pedido.numero_pedido_fip;
      CONTINUE;
    END IF;

    -- Pré-condição: exatamente 1 item no pedido (declaração do gestor).
    SELECT COUNT(*) INTO qtd_itens
      FROM itens_solicitacao_fat_direto
     WHERE solicitacao_id = pedido.id;

    IF qtd_itens != 1 THEN
      RAISE EXCEPTION 'PED-% tem % itens — esperado exatamente 1 pra incremento direto',
        pedido.numero_pedido_fip, qtd_itens;
    END IF;

    RAISE NOTICE 'Ajustando PED-% : valor_total=% soma_nfs=% excedente=%',
      pedido.numero_pedido_fip, pedido.valor_total, pedido.soma_nfs, excedente;

    -- 1) Incrementa valor_unitario do único item proporcionalmente à qtde.
    --    Se qtde=1, vira valor_unitario += excedente. Se qtde!=1, distribui.
    UPDATE itens_solicitacao_fat_direto
       SET valor_unitario = valor_unitario + (excedente / qtde_solicitada)
     WHERE solicitacao_id = pedido.id;

    -- 2) Atualiza pedido — registra histórico e novo valor_total.
    UPDATE solicitacoes_fat_direto
       SET valor_total = pedido.soma_nfs,
           valor_aprovado_original = COALESCE(valor_aprovado_original, pedido.valor_total),
           ajustes_divergencia = COALESCE(ajustes_divergencia, '[]'::jsonb) ||
             jsonb_build_array(jsonb_build_object(
               'tipo', 'ajuste_retroativo',
               'excedente', excedente,
               'valor_anterior', pedido.valor_total,
               'valor_novo', pedido.soma_nfs,
               'data', NOW(),
               'motivo', 'Ajuste retroativo: incremento no item único (18.1.14) conforme autorização do gestor — saldo do orçamento cobre'
             ))
     WHERE id = pedido.id;

    RAISE NOTICE '✓ PED-% ajustado: +R$ % no item único', pedido.numero_pedido_fip, excedente;
  END LOOP;
END $$;

-- Validação pós-ajuste — esperado saldo zero (ou positivo) nos dois pedidos.
SELECT s.numero_pedido_fip,
       s.valor_total,
       COALESCE(SUM(nf.valor) FILTER (WHERE nf.status != 'rejeitada'), 0) AS soma_nfs,
       s.valor_total - COALESCE(SUM(nf.valor) FILTER (WHERE nf.status != 'rejeitada'), 0) AS saldo,
       s.valor_aprovado_original,
       jsonb_array_length(s.ajustes_divergencia) AS qtd_ajustes
  FROM solicitacoes_fat_direto s
  LEFT JOIN notas_fiscais_fat_direto nf ON nf.solicitacao_id = s.id
 WHERE s.numero_pedido_fip IN (1043, 946)
   AND s.deletado_em IS NULL
 GROUP BY s.id, s.numero_pedido_fip, s.valor_total, s.valor_aprovado_original, s.ajustes_divergencia
 ORDER BY s.numero_pedido_fip;
