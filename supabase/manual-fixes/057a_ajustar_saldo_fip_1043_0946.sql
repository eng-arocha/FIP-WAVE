-- One-shot retroativo: ajusta saldo dos pedidos FIP-1043 e FIP-0946
-- ----------------------------------------------------------------------
-- Esses pedidos receberam NFs cuja soma excedeu o valor_total aprovado
-- (saldo negativo). Conforme autorização do gestor (registrada por email),
-- o ajuste é aplicado da mesma forma que o fluxo novo faria automaticamente:
--   1. valor_total += excedente (zera o saldo negativo)
--   2. valor_aprovado_original recebe snapshot do valor pré-ajuste
--   3. ajustes_divergencia ganha entrada com tipo='ajuste_retroativo'
--   4. cria 1 item de ajuste no pedido com descrição padronizada
--
-- Pré-requisito: Migration 057 já rodou (colunas valor_aprovado_original
-- e ajustes_divergencia existem).
--
-- Idempotente parcial: se rodar 2x, vai criar 2 itens de ajuste (porque
-- não há chave única). Não rode duas vezes.

DO $$
DECLARE
  pedido RECORD;
  excedente NUMERIC;
  first_item RECORD;
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

    IF excedente > 0.01 THEN
      RAISE NOTICE 'Ajustando PED-% : valor_total=% soma_nfs=% excedente=%',
        pedido.numero_pedido_fip, pedido.valor_total, pedido.soma_nfs, excedente;

      -- Pega 1º item pra herdar tarefa/detalhamento/local
      SELECT INTO first_item *
        FROM itens_solicitacao_fat_direto
       WHERE solicitacao_id = pedido.id
       LIMIT 1;

      IF first_item.id IS NULL THEN
        RAISE WARNING 'PED-% sem itens — pulando', pedido.numero_pedido_fip;
        CONTINUE;
      END IF;

      -- Atualiza pedido (atomic via subquery do snapshot)
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
                 'motivo', 'Ajuste retroativo conforme autorização anterior do gestor'
               ))
       WHERE id = pedido.id;

      -- Cria item de ajuste
      INSERT INTO itens_solicitacao_fat_direto (
        solicitacao_id, tarefa_id, detalhamento_id, descricao, local,
        qtde_solicitada, valor_unitario
      ) VALUES (
        pedido.id, first_item.tarefa_id, first_item.detalhamento_id,
        format('Ajuste retroativo de divergência — PED-%s — R$ %s',
               pedido.numero_pedido_fip, excedente::text),
        first_item.local, 1, excedente
      );
    ELSE
      RAISE NOTICE 'PED-% sem excedente positivo (saldo OK)', pedido.numero_pedido_fip;
    END IF;
  END LOOP;
END $$;
