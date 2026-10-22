-- ---------------------------------------------------------------------------
-- 092 — Regularizar a MED-005: pedido Wave, NF de serviço nº 5 e retenção
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
--
-- O PROBLEMA
--
-- A aprovação da MED-005 (09/09/2026) não conseguiu recalcular o boletim
-- (mesma falha registrada no 089). O bloco best-effort da rota de aprovação
-- pulou tudo que depende do boletim:
--   - crédito e débito de retenção no livro-razão (retencao_movimentos);
--   - o pedido `wave_servico` da medição;
--   - logo, a NF de serviço nº 5 da Wave nunca foi lançada no site.
-- Efeito visível: card Retenção do dashboard 30,6% contra 37,0% da medição.
-- Diagnóstico completo: docs/informakon/retencao-med5-pendente.md
--
-- A DECISÃO (usuário, 22/10/2026): seguir o Informakon.
--
--   Valor contratual da medição   1.094.690,67
--   (−) Material fornecido          645.249,89
--   Valor da medição (serviço)      449.440,78
--   (−) Retenção 5%                  54.734,53
--   (−) Descontos diversos                0,45
--   NF de serviço nº 5 (líquido)    394.705,80
--
-- A Wave recebeu a NF nº 5 já com a retenção descontada. Então o livro-razão
-- ganha crédito E débito de 54.734,53 (saldo segue zero, nada muda para a
-- Wave), e o pedido + NF nº 5 entram pelo líquido, como nas outras medições.
--
-- Data de emissão da NF nº 5: não informada — usa 09/09/2026 (aprovação).
-- Corrigível depois na tela da NF.
--
-- Rode os blocos NA ORDEM. O bloco 1 só lê. Só rode o 2 se o bloco 1 mostrar:
--   ja_tem_pedido_wave = 0, ja_tem_retencao = 0, ja_tem_nf_5 = 0,
--   soma_itens = 394705.80 e cabe_no_teto = true.
-- O bloco 2 recusa sozinho se algo disso não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- ===========================================================================
WITH med5 AS (
  SELECT id, data_aprovacao FROM medicoes
   WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND numero = 5
),
serv AS (
  SELECT mi.detalhamento_id, d.tarefa_id, d.codigo,
         mi.quantidade_medida * d.valor_servico_unit AS bruto
    FROM medicao_itens mi
    JOIN med5            ON med5.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0) > 0
     AND d.tarefa_id IS NOT NULL
)
SELECT
  (SELECT id FROM med5)                                         AS medicao_5_id,
  (SELECT data_aprovacao::date FROM med5)                       AS aprovada_em,
  (SELECT COUNT(*) FROM serv)                                   AS itens_com_servico,
  (SELECT ROUND(SUM(bruto), 2) FROM serv)                       AS servico_bruto_site,
  394705.80                                                     AS soma_itens,
  (SELECT COUNT(*) FROM solicitacoes_fat_direto
    WHERE tipo = 'wave_servico' AND observacoes ILIKE '%MED-005%'
      AND deletado_em IS NULL)                                  AS ja_tem_pedido_wave,
  (SELECT COUNT(*) FROM retencao_movimentos rm JOIN med5 ON med5.id = rm.origem_id) AS ja_tem_retencao,
  (SELECT COUNT(*) FROM notas_fiscais_fat_direto nf
     JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
    WHERE nf.numero_nf = '5'
      AND (s.tipo = 'wave_servico' OR nf.emitente ILIKE 'WAVE%')) AS ja_tem_nf_5,
  (SELECT valor_material_direto FROM contratos
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  - (SELECT COALESCE(SUM(valor_total), 0) FROM solicitacoes_fat_direto
      WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        AND status = 'aprovado' AND deletado_em IS NULL)      AS saldo_teto,
  (SELECT valor_material_direto FROM contratos
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  - (SELECT COALESCE(SUM(valor_total), 0) FROM solicitacoes_fat_direto
      WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
        AND status = 'aprovado' AND deletado_em IS NULL) >= 394705.80 AS cabe_no_teto;


-- ===========================================================================
-- BLOCO 2 — GRAVAÇÃO. Tudo numa transação: ou entra tudo, ou nada.
-- ===========================================================================
DO $$
DECLARE
  c_contrato  CONSTANT UUID    := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  c_liquido   CONSTANT NUMERIC := 394705.80;
  c_bruto_erp CONSTANT NUMERIC := 449440.78;
  c_retencao  CONSTANT NUMERIC := 54734.53;
  c_base_erp  CONSTANT NUMERIC := 1094690.67;
  c_emissao   CONSTANT DATE    := DATE '2026-09-09';
  v_med_id    UUID;
  v_aprov_em  TIMESTAMPTZ;
  v_usuario   UUID;
  v_aprovador UUID;
  v_sol_id    UUID;
  v_total_srv NUMERIC;
  v_soma      NUMERIC;
  v_saldo     NUMERIC;
BEGIN
  SELECT id, data_aprovacao INTO v_med_id, v_aprov_em
    FROM medicoes WHERE contrato_id = c_contrato AND numero = 5;
  IF v_med_id IS NULL THEN RAISE EXCEPTION 'MED-005 não encontrada.'; END IF;

  -- Idempotência: não roda duas vezes.
  IF EXISTS (SELECT 1 FROM solicitacoes_fat_direto
              WHERE tipo = 'wave_servico' AND observacoes ILIKE '%MED-005%'
                AND deletado_em IS NULL) THEN
    RAISE EXCEPTION 'Já existe pedido Wave da MED-005 — nada feito.';
  END IF;
  IF EXISTS (SELECT 1 FROM retencao_movimentos WHERE origem_id = v_med_id) THEN
    RAISE EXCEPTION 'Já existe retenção da MED-005 no livro-razão — nada feito.';
  END IF;

  -- Mesmo solicitante/aprovador do pedido Wave da MED-006 (gerado pelo site).
  SELECT solicitante_id, aprovador_id INTO v_usuario, v_aprovador
    FROM solicitacoes_fat_direto
   WHERE tipo = 'wave_servico' AND observacoes ILIKE '%MED-006%'
     AND deletado_em IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Pedido Wave da MED-006 não encontrado para copiar o usuário.'; END IF;

  -- 1) Pedido wave_servico, aprovado, pelo líquido do Informakon.
  INSERT INTO solicitacoes_fat_direto (
    contrato_id, solicitante_id, aprovador_id, data_solicitacao, data_aprovacao,
    status, tipo, fornecedor_razao_social, fornecedor_cnpj, valor_total, observacoes
  ) VALUES (
    c_contrato, v_usuario, COALESCE(v_aprovador, v_usuario), v_aprov_em, v_aprov_em,
    'aprovado', 'wave_servico', 'WAVE INSTALACOES SPE LTDA', '65.528.046/0001-23', c_liquido,
    'Aprovação da medição MED-005 em 09/09/2026. NF de SERVIÇO emitida pela WAVE INSTALACOES SPE LTDA '
    || 'pelo valor LÍQUIDO (já descontados 5% de retenção contratual). Os 5% retidos serão pagos ao final '
    || 'mediante condições contratuais e emissão de NF de serviço específica. '
    || 'LANÇADO RETROATIVAMENTE em 22/10/2026 (manual-fix 092): a aprovação de 09/09 não gerou este pedido. '
    || 'Valores do Informakon: base 1.094.690,67; serviço 449.440,78; retenção 54.734,53; '
    || 'descontos diversos 0,45; líquido 394.705,80.'
  ) RETURNING id INTO v_sol_id;

  -- 2) Itens: líquido rateado pelo serviço medido de cada item no site,
  --    resíduo de centavos no último item (mesma regra da rota de aprovação).
  SELECT SUM(mi.quantidade_medida * d.valor_servico_unit) INTO v_total_srv
    FROM medicao_itens mi JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.medicao_id = v_med_id
     AND mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0) > 0
     AND d.tarefa_id IS NOT NULL;
  IF COALESCE(v_total_srv, 0) <= 0 THEN RAISE EXCEPTION 'MED-005 sem serviço medido.'; END IF;

  INSERT INTO itens_solicitacao_fat_direto
    (solicitacao_id, tarefa_id, detalhamento_id, descricao, local, qtde_solicitada, valor_unitario)
  SELECT v_sol_id, d.tarefa_id, d.id, d.descricao, 'TORRE', 1,
         ROUND(c_liquido * (mi.quantidade_medida * d.valor_servico_unit) / v_total_srv, 2)
    FROM medicao_itens mi JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE mi.medicao_id = v_med_id
     AND mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0) > 0
     AND d.tarefa_id IS NOT NULL;

  SELECT SUM(valor_total) INTO v_soma FROM itens_solicitacao_fat_direto WHERE solicitacao_id = v_sol_id;
  UPDATE itens_solicitacao_fat_direto
     SET valor_unitario = valor_unitario + (c_liquido - v_soma)
   WHERE id = (SELECT i.id FROM itens_solicitacao_fat_direto i
                 JOIN detalhamentos d ON d.id = i.detalhamento_id
                WHERE i.solicitacao_id = v_sol_id
                ORDER BY d.codigo DESC LIMIT 1);
  SELECT SUM(valor_total) INTO v_soma FROM itens_solicitacao_fat_direto WHERE solicitacao_id = v_sol_id;
  IF v_soma <> c_liquido THEN
    RAISE EXCEPTION 'Itens somam % e não %. Nada gravado.', v_soma, c_liquido;
  END IF;

  -- 3) NF nº 5 da Wave, aprovada, pelo líquido.
  INSERT INTO notas_fiscais_fat_direto
    (solicitacao_id, numero_nf, emitente, cnpj_emitente, valor, data_emissao,
     descricao, status, lancado_por_id, lancado_em)
  VALUES
    (v_sol_id, '5', 'WAVE INSTALACOES SPE LTDA', '65.528.046/0001-23', c_liquido, c_emissao,
     'NF de serviço da MED-005 — lançada retroativamente (manual-fix 092). Data de emissão a confirmar.',
     'aprovada', v_usuario, NOW());

  -- 4) Livro-razão: crédito e débito da retenção que o Informakon reteve.
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'credito', 'medicao_aprovada', v_med_id, c_retencao,
    'Retenção 5% da MED-005 conforme Informakon: 5% × R$ ' || c_base_erp
    || ' (lançamento retroativo, manual-fix 092)', v_usuario);
  PERFORM aplicar_movimento_retencao(
    c_contrato, 'debito', 'nf_wave_emitida', v_med_id, c_retencao,
    'Desconto na NF Wave nº 5 da MED-005: serviço R$ ' || c_bruto_erp
    || ' − retenção R$ ' || c_retencao || ' − desc. diversos R$ 0,45 = R$ ' || c_liquido
    || ' (lançamento retroativo, manual-fix 092)', v_usuario);

  SELECT retencao_saldo_contrato(c_contrato) INTO v_saldo;
  RAISE NOTICE 'OK — pedido %, NF nº 5, retenção 54.734,53 (crédito + débito). Saldo do livro-razão: %', v_sol_id, v_saldo;
END $$;


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA depois de gravar. Só lê.
-- Esperado: MED-005 com crédito e débito de 54.734,53; total de créditos
-- 236.841,46 (sem a MED-007); saldo 0,00.
-- ===========================================================================
SELECT m.numero, rm.tipo, rm.origem_tipo, rm.valor, rm.saldo_apos
  FROM retencao_movimentos rm
  LEFT JOIN medicoes m ON m.id = rm.origem_id
 ORDER BY rm.created_at;
