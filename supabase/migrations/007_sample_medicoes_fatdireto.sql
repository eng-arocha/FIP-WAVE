-- =============================================================
-- Migration 007: Sample medições, fat direto, NFs for demo
-- FIP × WAVE contract realistic sample data
-- =============================================================

-- ── 1. Sample medições de serviço ────────────────────────────
INSERT INTO medicoes (id, contrato_id, numero, periodo_referencia, tipo, status, valor_total,
  data_submissao, data_aprovacao, solicitante_nome, solicitante_email, observacoes)
VALUES
  ('b1000000-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   1, '2026-03', 'servico', 'aprovado', 79512.18,
   '2026-04-02 09:00:00+00', '2026-04-05 14:30:00+00',
   'Carlos Arocha', 'carlos.arocha@fip.com.br',
   'Medição 01 — Março 2026. Avanço inicial na subestação e infraestrutura elétrica.'),

  ('b2000000-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   2, '2026-04', 'servico', 'aprovado', 143287.44,
   '2026-05-03 08:30:00+00', '2026-05-07 11:00:00+00',
   'Carlos Arocha', 'carlos.arocha@fip.com.br',
   'Medição 02 — Abril 2026. Continuidade subestação + início alimentação elétrica.'),

  ('b3000000-0000-0000-0000-000000000003',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   3, '2026-05', 'servico', 'submetido', 97642.90,
   '2026-06-02 10:00:00+00', NULL,
   'Carlos Arocha', 'carlos.arocha@fip.com.br',
   'Medição 03 — Maio 2026. Avanço grupos 1 e 2. Aguardando aprovação.')
ON CONFLICT (contrato_id, numero) DO NOTHING;

-- ── 2. medicao_itens (valor medido por detalhamento) ─────────
-- MED-001 (Março 2026): itens grupo 1 (Elétrica Subestação)
INSERT INTO medicao_itens (id, medicao_id, detalhamento_id, quantidade_medida, valor_unitario, percentual_medido)
VALUES
  -- 1.1.1 ENTRADA ENERGIA INFRA (valor_unit=30747.78, serv_unit=16344.34)
  (uuid_generate_v4(), 'b1000000-0000-0000-0000-000000000001', '525186fd-f01b-846b-61bf-c814c132f729', 0.50, 30747.7800, 50.00),
  -- 1.2.1 ENTRADA CABEAMENTO (valor_unit=8895.41)
  (uuid_generate_v4(), 'b1000000-0000-0000-0000-000000000001', '0c0e44a4-a61a-8f5a-651c-a35daf0e38d2', 0.50, 8895.4100, 50.00),
  -- 1.4.1 SE PMUC INFRA (valor_unit=26909.52)
  (uuid_generate_v4(), 'b1000000-0000-0000-0000-000000000001', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 0.25, 26909.5200, 25.00),
  -- 1.5.1 SE PMUC CABEAMENTO (valor_unit=20114.28)
  (uuid_generate_v4(), 'b1000000-0000-0000-0000-000000000001', '6c150539-45dc-0b78-2e46-766b12251f17', 0.25, 20114.2800, 25.00)
ON CONFLICT (medicao_id, detalhamento_id) DO NOTHING;

-- MED-002 (Abril 2026): mais avanço grupo 1 + início outros
INSERT INTO medicao_itens (id, medicao_id, detalhamento_id, quantidade_medida, valor_unitario, percentual_medido)
VALUES
  -- 1.1.1 agora 100% (delta: mais 50%)
  (uuid_generate_v4(), 'b2000000-0000-0000-0000-000000000002', '525186fd-f01b-846b-61bf-c814c132f729', 0.50, 30747.7800, 100.00),
  -- 1.4.1 agora 75% (delta: mais 50%)
  (uuid_generate_v4(), 'b2000000-0000-0000-0000-000000000002', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 0.50, 26909.5200, 75.00),
  -- 1.5.1 agora 75% (delta: mais 50%)
  (uuid_generate_v4(), 'b2000000-0000-0000-0000-000000000002', '6c150539-45dc-0b78-2e46-766b12251f17', 0.50, 20114.2800, 75.00),
  -- 1.7.1 SE PMUC CABEAMENTO BT (valor_unit=54905.38)
  (uuid_generate_v4(), 'b2000000-0000-0000-0000-000000000002', '637934c5-31e6-a843-80c5-1d7bf7170c36', 0.25, 54905.3800, 25.00),
  -- 1.8.1 SE PMUC QUADROS (valor_unit=124927.76)
  (uuid_generate_v4(), 'b2000000-0000-0000-0000-000000000002', '148dd896-485d-7a05-5914-858e3d98f7b2', 0.25, 124927.7600, 25.00)
ON CONFLICT (medicao_id, detalhamento_id) DO NOTHING;

-- MED-003 (Maio 2026): continuidade
INSERT INTO medicao_itens (id, medicao_id, detalhamento_id, quantidade_medida, valor_unitario, percentual_medido)
VALUES
  -- 1.4.1 agora 100%
  (uuid_generate_v4(), 'b3000000-0000-0000-0000-000000000003', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 0.25, 26909.5200, 100.00),
  -- 1.7.1 agora 50%
  (uuid_generate_v4(), 'b3000000-0000-0000-0000-000000000003', '637934c5-31e6-a843-80c5-1d7bf7170c36', 0.25, 54905.3800, 50.00),
  -- 1.9.1 SE GRUPO A INFRA (valor_unit=23906.86)
  (uuid_generate_v4(), 'b3000000-0000-0000-0000-000000000003', '1861dcc2-30f6-40d1-68f6-797568c58874', 0.25, 23906.8600, 25.00)
ON CONFLICT (medicao_id, detalhamento_id) DO NOTHING;

-- ── 3. medicao_progresso_fisico (para os gráficos de acompanhamento) ──
INSERT INTO medicao_progresso_fisico (medicao_id, detalhamento_id, pct_executado, valor_servico_medido)
VALUES
  -- MED-001
  ('b1000000-0000-0000-0000-000000000001', '525186fd-f01b-846b-61bf-c814c132f729', 50, 8172.17),
  ('b1000000-0000-0000-0000-000000000001', '0c0e44a4-a61a-8f5a-651c-a35daf0e38d2', 50, 1221.10),
  ('b1000000-0000-0000-0000-000000000001', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 25, 4096.46),
  ('b1000000-0000-0000-0000-000000000001', '6c150539-45dc-0b78-2e46-766b12251f17', 25, 1319.28),
  -- MED-002
  ('b2000000-0000-0000-0000-000000000002', '525186fd-f01b-846b-61bf-c814c132f729', 50, 8172.17),
  ('b2000000-0000-0000-0000-000000000002', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 50, 8192.92),
  ('b2000000-0000-0000-0000-000000000002', '6c150539-45dc-0b78-2e46-766b12251f17', 50, 2638.57),
  ('b2000000-0000-0000-0000-000000000002', '637934c5-31e6-a843-80c5-1d7bf7170c36', 25, 2772.23),
  ('b2000000-0000-0000-0000-000000000002', '148dd896-485d-7a05-5914-858e3d98f7b2', 25, 1237.60),
  -- MED-003
  ('b3000000-0000-0000-0000-000000000003', 'de5cb70f-26ed-83b8-cafa-f6d084ad1676', 25, 4096.46),
  ('b3000000-0000-0000-0000-000000000003', '637934c5-31e6-a843-80c5-1d7bf7170c36', 25, 2772.23),
  ('b3000000-0000-0000-0000-000000000003', '1861dcc2-30f6-40d1-68f6-797568c58874', 25, 2974.37)
ON CONFLICT (medicao_id, detalhamento_id) DO NOTHING;

-- ── 4. Atualizar valor_total das medições ─────────────────────
UPDATE medicoes SET valor_total = (
  SELECT COALESCE(SUM(valor_medido), 0)
  FROM medicao_itens WHERE medicao_id = 'b1000000-0000-0000-0000-000000000001'
) WHERE id = 'b1000000-0000-0000-0000-000000000001';

UPDATE medicoes SET valor_total = (
  SELECT COALESCE(SUM(valor_medido), 0)
  FROM medicao_itens WHERE medicao_id = 'b2000000-0000-0000-0000-000000000002'
) WHERE id = 'b2000000-0000-0000-0000-000000000002';

UPDATE medicoes SET valor_total = (
  SELECT COALESCE(SUM(valor_medido), 0)
  FROM medicao_itens WHERE medicao_id = 'b3000000-0000-0000-0000-000000000003'
) WHERE id = 'b3000000-0000-0000-0000-000000000003';

-- ── 5. Faturamento Direto — Solicitações ─────────────────────
INSERT INTO solicitacoes_fat_direto
  (id, contrato_id, status, data_solicitacao, data_aprovacao, observacoes,
   fornecedor_razao_social, fornecedor_cnpj, fornecedor_contato, valor_total)
VALUES
  -- SOL-001: aprovada — Painéis de Média Tensão
  ('s1000000-0000-0000-0000-000000000001',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aprovado', '2026-03-15 09:00:00+00', '2026-03-20 14:00:00+00',
   'Fornecimento de Painel de Média Tensão conforme especificação técnica.',
   'Schneider Electric Brasil Ltda', '61.649.477/0001-06', 'João Silva – (11) 99876-5432',
   348931.39),

  -- SOL-002: aprovada — Geradores PMUC
  ('s2000000-0000-0000-0000-000000000002',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aprovado', '2026-04-05 08:00:00+00', '2026-04-10 16:00:00+00',
   'Grupo Gerador PMUC 500 KVA + QTA de reversão. Entrega em 60 dias.',
   'Stemac Grupos Geradores Ltda', '03.773.069/0001-00', 'Maria Fernandes – (51) 98765-4321',
   820562.47),

  -- SOL-003: aguardando aprovação — SE PMUC Equipamentos
  ('s3000000-0000-0000-0000-000000000003',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'aguardando_aprovacao', '2026-05-20 11:00:00+00', NULL,
   'Transformadores de força SE PMUC — 2 unidades.',
   'ABB Ltda', '11.601.722/0001-00', 'Roberto Matos – (21) 97654-3210',
   159374.24)
ON CONFLICT DO NOTHING;

-- ── 6. Itens das solicitações ─────────────────────────────────
INSERT INTO itens_solicitacao_fat_direto
  (solicitacao_id, tarefa_id, descricao, local, qtde_solicitada, valor_unitario)
VALUES
  -- SOL-001 itens
  ('s1000000-0000-0000-0000-000000000001', '266d1573-d5ac-c3ae-8d44-502d8749f403',
   'Painel de Média Tensão conforme projeto elétrico — modelo SM6',
   'TORRE', 1, 348931.39),

  -- SOL-002 itens (2 itens)
  ('s2000000-0000-0000-0000-000000000002', '488d62b0-ccd2-cef1-864f-cf39a7158e52',
   'Grupo Gerador PMUC 500 KVA Perkins c/ escapamento vertical e módulo de controle',
   'CASA DE MÁQUINAS', 1, 431053.37),
  ('s2000000-0000-0000-0000-000000000002', '58a685be-9ae6-9ee0-a9f5-9dda93c29765',
   'Quadros de Transferência Automática QTA + Quadros de Reversão',
   'CASA DE MÁQUINAS', 1, 389509.10),

  -- SOL-003 itens
  ('s3000000-0000-0000-0000-000000000003', '1ac1df64-6152-a2da-c04e-618085b57d2f',
   'Transformadores de força 2 x 500 KVA SE PMUC — ABB tipo seco',
   'TORRE', 1, 159374.24)
ON CONFLICT DO NOTHING;

-- Fix SOL-002 valor_total to match items sum
UPDATE solicitacoes_fat_direto
SET valor_total = 431053.37 + 389509.10
WHERE id = 's2000000-0000-0000-0000-000000000002';

-- ── 7. Notas Fiscais (para solicitações aprovadas) ────────────
INSERT INTO notas_fiscais_fat_direto
  (id, solicitacao_id, numero_nf, emitente, cnpj_emitente, valor, data_emissao, descricao, status, validado_em)
VALUES
  -- NF para SOL-001
  ('n1000000-0000-0000-0000-000000000001',
   's1000000-0000-0000-0000-000000000001',
   '004821', 'Schneider Electric Brasil Ltda', '61.649.477/0001-06',
   348931.39, '2026-04-15',
   'NF ref. Painel Média Tensão SM6 conforme pedido SOL-001',
   'validada', '2026-04-20 09:00:00+00'),

  -- NF 1 para SOL-002 (entrega parcial — gerador)
  ('n2000000-0000-0000-0000-000000000002',
   's2000000-0000-0000-0000-000000000002',
   '012345', 'Stemac Grupos Geradores Ltda', '03.773.069/0001-00',
   431053.37, '2026-05-10',
   'NF ref. Grupo Gerador PMUC 500 KVA — entrega e instalação',
   'validada', '2026-05-15 14:00:00+00'),

  -- NF 2 para SOL-002 (QTAs)
  ('n3000000-0000-0000-0000-000000000003',
   's2000000-0000-0000-0000-000000000002',
   '012398', 'Stemac Grupos Geradores Ltda', '03.773.069/0001-00',
   312000.00, '2026-05-25',
   'NF parcial ref. Quadros de Transferência QTA — entrega inicial',
   'pendente', NULL)
ON CONFLICT DO NOTHING;
