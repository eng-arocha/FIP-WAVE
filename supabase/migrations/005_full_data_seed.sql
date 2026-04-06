-- =============================================================
-- Migration 005: Full data re-seed from Excel + new tables
-- FIP × WAVE contract structure with real data
-- =============================================================

-- Step 1: Add new columns to detalhamentos
ALTER TABLE detalhamentos
  ADD COLUMN IF NOT EXISTS local TEXT NOT NULL DEFAULT 'TORRE',
  ADD COLUMN IF NOT EXISTS valor_material_unit NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico_unit  NUMERIC(15,4) NOT NULL DEFAULT 0;

-- Step 2: Add tipo_medicao columns to tarefas and detalhamentos
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS valor_material NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Step 3: Create planejamento tables
CREATE TABLE IF NOT EXISTS planejamento_fisico (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grupo_macro_id   UUID NOT NULL REFERENCES grupos_macro(id) ON DELETE CASCADE,
  mes              DATE NOT NULL,
  pct_planejado    NUMERIC(8,4) NOT NULL DEFAULT 0,
  UNIQUE(grupo_macro_id, mes)
);

CREATE TABLE IF NOT EXISTS planejamento_fat_direto (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grupo_macro_id   UUID NOT NULL REFERENCES grupos_macro(id) ON DELETE CASCADE,
  mes              DATE NOT NULL,
  pct_planejado    NUMERIC(8,4) NOT NULL DEFAULT 0,
  UNIQUE(grupo_macro_id, mes)
);

-- Step 4: Create faturamento direto authorization flow tables
CREATE TABLE IF NOT EXISTS solicitacoes_fat_direto (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id      UUID NOT NULL REFERENCES contratos(id),
  numero           SERIAL,
  status           TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','rejeitado','cancelado')),
  solicitante_id   UUID REFERENCES perfis(id),
  aprovador_id     UUID REFERENCES perfis(id),
  data_solicitacao TIMESTAMPTZ DEFAULT NOW(),
  data_aprovacao   TIMESTAMPTZ,
  observacoes      TEXT,
  motivo_rejeicao  TEXT,
  valor_total      NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS itens_solicitacao_fat_direto (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitacao_id       UUID NOT NULL REFERENCES solicitacoes_fat_direto(id) ON DELETE CASCADE,
  tarefa_id            UUID NOT NULL REFERENCES tarefas(id),
  descricao            TEXT NOT NULL,
  local                TEXT NOT NULL DEFAULT 'TORRE',
  qtde_solicitada      NUMERIC(15,3) NOT NULL,
  valor_unitario       NUMERIC(15,4) NOT NULL,
  valor_total          NUMERIC(15,2) GENERATED ALWAYS AS (qtde_solicitada * valor_unitario) STORED,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notas_fiscais_fat_direto (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  solicitacao_id       UUID NOT NULL REFERENCES solicitacoes_fat_direto(id),
  numero_nf            TEXT NOT NULL,
  emitente             TEXT NOT NULL,
  cnpj_emitente        TEXT,
  valor                NUMERIC(15,2) NOT NULL,
  data_emissao         DATE NOT NULL,
  descricao            TEXT,
  url_arquivo          TEXT,
  status               TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','validada','rejeitada')),
  validado_por_id      UUID REFERENCES perfis(id),
  validado_em          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Create physical progress measurement table
CREATE TABLE IF NOT EXISTS medicao_progresso_fisico (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medicao_id           UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  detalhamento_id      UUID NOT NULL REFERENCES detalhamentos(id),
  pct_executado        INTEGER NOT NULL DEFAULT 0 CHECK (pct_executado IN (0,25,50,75,100)),
  valor_servico_medido NUMERIC(15,2),
  observacao           TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(medicao_id, detalhamento_id)
);

-- Step 6: Indexes
CREATE INDEX IF NOT EXISTS idx_plan_fisico_grupo ON planejamento_fisico(grupo_macro_id);
CREATE INDEX IF NOT EXISTS idx_plan_fatd_grupo ON planejamento_fat_direto(grupo_macro_id);
CREATE INDEX IF NOT EXISTS idx_sol_fatd_contrato ON solicitacoes_fat_direto(contrato_id);
CREATE INDEX IF NOT EXISTS idx_sol_fatd_status ON solicitacoes_fat_direto(status);
CREATE INDEX IF NOT EXISTS idx_nf_fatd_sol ON notas_fiscais_fat_direto(solicitacao_id);

-- Step 7: Re-seed grupos_macro with real Excel data
-- Delete existing placeholder grupos and reseed properly
DELETE FROM medicao_itens WHERE detalhamento_id IN (
  SELECT d.id FROM detalhamentos d
  JOIN tarefas t ON t.id = d.tarefa_id
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
  WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
DELETE FROM detalhamentos WHERE tarefa_id IN (
  SELECT t.id FROM tarefas t
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
  WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
DELETE FROM tarefas WHERE grupo_macro_id IN (
  SELECT id FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
DELETE FROM grupos_macro WHERE contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Insert 18 grupos_macro
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('c470908c-37ad-4bbd-b15e-c30420bf3e04', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1', 'ELÉTRICA SUBESTAÇÃO', 'misto', 976005.27, 838822.32, 137182.95, 1);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2', 'GERAÇÃO', 'misto', 1834456.23, 1610013.92, 224442.31, 2);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('da154b43-68e8-771a-ac55-8e496bddc64a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3', 'ALIMENTAÇÃO ELÉTRICA', 'misto', 2535013.12, 1497140.20, 1037872.92, 3);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('2341f9a5-4016-bee6-1332-474318c39d19', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '4', '4. DISTRIBUIÇÃO ELÉTRICA', 'misto', 987896.02, 317136.21, 670759.81, 4);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('0744406d-596c-dcdf-964b-d9be3b19b3b3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5', '5. LUMINÁRIAS', 'servico', 287273.52, 0.00, 287273.52, 5);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('00061229-7986-699d-88d2-d040dbd492d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '6', '6. QUADROS ELÉTRICOS', 'misto', 973939.07, 661523.63, 312415.44, 6);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('3c43cadf-2161-5334-9fd5-293b09bb06fd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '7', '7. LÓGICA (DADOS E VOZ) - INFRA SECA', 'misto', 277801.37, 143093.30, 134708.07, 7);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '8', '8. ÁGUA PLUVIAL', 'misto', 1429014.84, 640644.52, 788370.32, 8);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('369fd87b-b762-1179-ab06-37b2a1966cc8', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '9', '9. ESGOTO', 'misto', 1898133.76, 850377.31, 1047756.45, 9);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('488b4651-16cc-adbe-2662-edadc0f036b7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '10', '10. HIDRÁULICA', 'misto', 2852340.51, 1653704.59, 1198635.92, 10);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '12', '12. PISCINA E SPA', 'misto', 128774.75, 89578.25, 39196.50, 12);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('578cb596-6c31-addb-191b-061c9b01848d', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '13', '13. LOUÇAS E METAIS', 'misto', 126287.59, 71112.44, 55175.15, 13);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '14', '14. COMBATE AO INCÊNDIO', 'misto', 1682329.71, 1312168.18, 370161.53, 14);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('4f5558fa-2077-3e92-0d34-02dea3e4cac2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '15', '15. EXTINTOR E SINALIZAÇÃO', 'misto', 150468.34, 119836.84, 30631.50, 15);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '16', '16. SISTEMA DE DETECÇÃO E ALARME DE INCÊNDIO (SDAI)', 'misto', 402774.19, 252519.89, 150254.30, 16);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '17', '17. GÁS', 'misto', 255566.85, 184726.63, 70840.22, 17);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '18', '18. SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA', 'misto', 335924.86, 191601.77, 144323.09, 18);
INSERT INTO grupos_macro (id, contrato_id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico, ordem) VALUES
  ('a1877456-1a60-264d-684b-0c11fd3f471c', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '19', '19. SERVIÇOS COMPLEMENTARES', 'faturamento_direto', 866000.00, 866000.00, 0.00, 19);

-- Insert tarefas (nivel 2)
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('8ef2c00c-8472-fe20-c5a3-5e090f71bc82', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.1', 'ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )', 'SV', 1.0, 30747.7800, 30747.78, 14403.44, 16344.34);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('efe17ea8-dee6-6267-d7ac-0738c6349726', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.2', 'ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )', 'SV', 1.0, 8895.4100, 8895.41, 6453.21, 2442.20);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('266d1573-d5ac-c3ae-8d44-502d8749f403', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.3', 'ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )', 'SV', 1.0, 348931.3900, 348931.39, 320380.45, 28550.94);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('044dc6cd-0d66-b7d0-3634-4151b60df888', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.4', 'SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)', 'SV', 1.0, 26909.5200, 26909.52, 10523.68, 16385.84);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('8eba7215-c8aa-6161-acff-9bb32f9b5184', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.5', 'SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )', 'SV', 1.0, 20114.2800, 20114.28, 14837.15, 5277.13);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('1ac1df64-6152-a2da-c04e-618085b57d2f', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.6.', 'SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )', 'SV', 1.0, 159374.2400, 159374.24, 146668.20, 12706.04);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('7d07ff97-0de8-bb33-ede6-78817ba09e57', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.7', 'SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG''s )', 'SV', 1.0, 54905.3800, 54905.38, 43816.48, 11088.90);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('ef9a06aa-f2b0-be4e-fb89-956218f54a1d', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.8', 'SUBESTAÇÃO PMUC - QUADROS ( CPG''s )', 'SV', 1.0, 124927.7600, 124927.76, 119977.36, 4950.40);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('25b156a4-20e8-253f-b373-f074f23abbc9', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.9', 'SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )', 'SV', 1.0, 23906.8600, 23906.86, 12009.39, 11897.47);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('0489db72-268a-fb54-89e0-8874482155bd', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.10', 'SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )', 'SV', 1.0, 10610.2500, 10610.25, 7838.02, 2772.23);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('61cccd8a-a01e-4ace-5a10-e4369540a6a0', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.11', 'SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )', 'SV', 1.0, 77888.6000, 77888.60, 71783.10, 6105.50);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('3ebe4212-e8c7-8813-8f55-9c78a651b380', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.12', 'SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG'')', 'SV', 1.0, 27452.6900, 27452.69, 21908.24, 5544.45);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('ac90b5b8-1dc0-8cd8-976e-b5243b18c52e', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.13', 'SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )', 'SV', 1.0, 35721.4400, 35721.44, 32751.20, 2970.24);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('68616ce3-cdad-e947-330b-15286b9091ca', 'c470908c-37ad-4bbd-b15e-c30420bf3e04', '1.14', 'ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )', 'SV', 1.0, 25619.6700, 25619.67, 15472.40, 10147.27);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('488d62b0-ccd2-cef1-864f-cf39a7158e52', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.1', 'GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )', 'SV', 1.0, 446509.1700, 446509.17, 431063.70, 15445.47);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('58a685be-9ae6-9ee0-a9f5-9dda93c29765', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.2', 'GRUPO GERADOR PMUC  - PAINEIS (  QTA''s + Quadros reversão )', 'SV', 1.0, 389851.3000, 389851.30, 352689.90, 37161.40);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('3b6cee64-f2c3-034f-f42a-ab141c104e89', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.3', 'GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )', 'SV', 1.0, 60941.7800, 60941.78, 25823.49, 35118.29);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('884bae01-1bb7-a5a7-25a2-05761410adf4', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.4', 'GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO', 'SV', 1.0, 144019.2700, 144019.27, 115009.90, 29009.37);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('4ba9c271-6a02-2bba-96eb-0b42bd8eb222', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.5', 'GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )', 'SV', 1.0, 431053.3700, 431053.37, 415311.09, 15742.28);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('0380b53f-f8aa-f6f0-3ec5-f7dad1059e89', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.6', 'GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )', 'SV', 1.0, 113013.6100, 113013.61, 101132.64, 11880.97);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('04c06583-f0b5-4595-848d-f824d478f887', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.7', 'GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )', 'SV', 1.0, 63561.8900, 63561.89, 38592.13, 24969.76);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('0a435407-69d6-be27-b3d2-396c341bf920', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.8', 'GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO', 'SV', 1.0, 175705.2800, 175705.28, 124191.10, 51514.18);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('3d7ad1e1-bcf9-eb8a-4a4a-7ea2ce05bf90', '0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2.9', 'GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO', 'SV', 1.0, 9800.5600, 9800.56, 6199.97, 3600.59);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('c04079ee-6333-6e19-0a4f-0b442bc26f45', 'da154b43-68e8-771a-ac55-8e496bddc64a', '3.1', 'INFRAESTRUTURA -  ALIMENTAÇÃO ELÉTRICA ( Eletrocalhas,Eletrodutos, caixas )', 'SV', 1.0, 741426.0100, 741426.01, 356035.46, 385390.55);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('c2d03d67-2239-1d36-b037-836252535dc5', 'da154b43-68e8-771a-ac55-8e496bddc64a', '3.2', 'CABEAMENTO- ALIMENTAÇÃO ELÉTRICA ( CABOS ATOX 1KV )', 'SV', 1.0, 1793587.1145, 1793587.11, 1141104.74, 652482.37);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('01fdc05a-78ec-2a68-4f75-5df05cf7d050', '2341f9a5-4016-bee6-1332-474318c39d19', '4.1', 'INFRAESTRUTURA -  DISTRIBUIÇÃO ELÉTRICA (Eletrocalhas, eletrodutos e caixas )', 'SV', 1.0, 530136.1300, 530136.13, 127341.25, 402794.88);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '2341f9a5-4016-bee6-1332-474318c39d19', '4.2', 'CABEAMENTO- DISTRIBUIÇÃO ELETRICA ( Cabos 750v 2,5mm², 4mm² e 6mm² )', 'SV', 1.0, 418568.3300, 418568.33, 175718.45, 242849.88);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('f0af7843-372d-e1b8-3165-ad02d22bed0f', '2341f9a5-4016-bee6-1332-474318c39d19', '4.3', 'ACABAMENTO - DISTRIBUIÇÃO ELETRICA ( Tomadas e Interruptores )', 'SV', 1.0, 39191.5600, 39191.56, 14076.51, 25115.05);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '0744406d-596c-dcdf-964b-d9be3b19b3b3', '5.1', 'NSTALAÇÕES DE LUMINÁRIAS CONFORME PROJETO ( SOMENTE MÃO DE OBRA )', 'SV', 1.0, 287273.5200, 287273.52, 0.00, 287273.52);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('974ed740-1cc7-805e-96ef-4afc0e6e0113', '00061229-7986-699d-88d2-d040dbd492d1', '6.1', 'QUADROS DE ILUMINAÇÃO', 'SV', 1.0, 973939.0686, 973939.07, 661523.63, 312415.44);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('bc83b534-3546-81e3-d7bb-8c3e6902729e', '3c43cadf-2161-5334-9fd5-293b09bb06fd', '7.1', 'INFRAESTRUTURA -  DADOS E VOZ (Eletrocalhas, eletrodutos e caixas )', 'SV', 1.0, 277801.3700, 277801.37, 143093.30, 134708.07);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('46b91a6c-c77e-12f4-1be9-3de563613e04', '428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '8.1', 'ÁGUA PLUVIAL ( TUBOS E CONEXÕES )', 'SV', 1.0, 1378381.0361, 1378381.04, 601272.53, 777108.51);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('78cf38dd-10bd-8951-3e1b-f83d86fa17fb', '428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '8.2', 'BARRILHETE DE BOMBAS DRENAGEM', 'SV', 1.0, 50633.8000, 50633.80, 39371.99, 11261.81);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '369fd87b-b762-1179-ab06-37b2a1966cc8', '9.1', 'ESGOTO SANITARIO', 'SV', 1.0, 1898133.7600, 1898133.76, 850377.31, 1047756.45);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('c003a631-a38e-3f20-3256-896e58f79191', '488b4651-16cc-adbe-2662-edadc0f036b7', '10.1', 'HIDRÁULICA (ÁGUA FRIA)', 'SV', 1.0, 1422075.9200, 1422075.92, 738473.57, 683602.35);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('cecf58c1-f4cd-c5c5-5629-f6daa349d302', '488b4651-16cc-adbe-2662-edadc0f036b7', '10.2', 'HIDRÁULICA (ÁGUA QUENTE)', 'SV', 1.0, 673244.3290, 673244.33, 340264.72, 332979.61);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('abc9f4d1-f216-8143-436a-9acaedaa1dd9', '488b4651-16cc-adbe-2662-edadc0f036b7', '10.3', 'HIDRÁULICA (BARRILHETES BOMBAS E REDUTORAS)', 'SV', 1.0, 757020.2600, 757020.26, 574966.30, 182053.96);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('91657f80-e132-9315-56a9-760df5a77555', '335add86-a820-19fb-f9ad-e7aa6a3e9a95', '12.1', '', 'SV', 1.0, 128774.7500, 128774.75, 89578.25, 39196.50);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('8cba73cb-ead5-c87f-9225-c96236e2ee09', '578cb596-6c31-addb-191b-061c9b01848d', '13.1', 'PILOTIS ( SÓ MÃO DE OBRA )', 'SV', 1.0, 18000.6100, 18000.61, 0.00, 18000.61);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('2f2c41b0-e82c-652c-bc14-0a71e60ec148', '578cb596-6c31-addb-191b-061c9b01848d', '13.2', 'APARTAMENTOS', 'SV', 1.0, 108286.9800, 108286.98, 71112.44, 37174.54);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '14.1', 'HIDRANTE', 'SV', 1.0, 340487.9604, 340487.96, 302777.99, 37709.97);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('e5977692-4f97-b012-e08e-d2df4cedd5d3', '9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '14.2', 'SPRINKLERS', 'SV', 1.0, 1202614.9181, 1202614.92, 895345.44, 307269.48);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('f7363bb4-052f-ce59-7ad2-e839a08717ee', '9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '14.3', 'BOMBAS E BARRILHETES', 'SV', 1.0, 139226.8300, 139226.83, 114044.75, 25182.08);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('e27bb86b-db5c-846c-6520-6b7b105951e0', '4f5558fa-2077-3e92-0d34-02dea3e4cac2', '15.1', 'LUMINARIAS DE EMERGENCIA + ROTA DE FUGA', 'SV', 1.0, 60531.4200, 60531.42, 39558.21, 20973.21);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('6f1829f2-6813-0079-a9f3-7f285f5522a5', '4f5558fa-2077-3e92-0d34-02dea3e4cac2', '15.2', 'EXTINTORES', 'SV', 1.0, 89936.9200, 89936.92, 80278.63, 9658.29);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('4622febb-2ffc-d980-ed20-d64ef1103d48', 'dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '16.1', 'INFRA ESTRUTURA ( ELTRODUTOS E CAIXAS )', 'SV', 1.0, 139792.2830, 139792.28, 59829.91, 79962.37);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('0009349d-287b-0cfc-2dad-447b348dfd35', 'dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '16.2', 'CABEAMENTO SDAI ( CABO BLINDADO )', 'SV', 1.0, 56320.2911, 56320.29, 26811.43, 29508.86);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('6be41991-3697-f581-1baa-fad46fa0e2fc', 'dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '16.3', 'EQUIPAMENTOS', 'SV', 1.0, 206661.6200, 206661.62, 165878.55, 40783.07);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('273aabfa-a3c1-f4a7-8bb9-eb605307b7af', 'c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '17.1', 'TUBOS E CONEXÕES', 'SV', 1.0, 161093.9000, 161093.90, 105317.78, 55776.12);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('273aabfa-a3c1-f4a7-8bb9-eb605307b7af', 'c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '17.1', 'CAIXAS, REGULADORES E VALVULAS', 'SV', 1.0, 94472.9500, 94472.95, 79408.85, 15064.10);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('227ee554-792f-c9d2-4283-aff7448c4eb7', 'e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '18.1', 'SPDA', 'SV', 1.0, 335924.8600, 335924.86, 191601.77, 144323.09);
INSERT INTO tarefas (id, grupo_macro_id, codigo, nome, unidade, quantidade_contratada, valor_unitario, valor_total, valor_material, valor_servico) VALUES
  ('8b6ab969-5fb9-4e98-aa3d-31489278657c', 'a1877456-1a60-264d-684b-0c11fd3f471c', '19.1', 'DESCREVER SUBDIVISÃO', 'SV', 1.0, 866000.0000, 866000.00, 866000.00, 0.00);

-- Insert detalhamentos (nivel 3) - 335 records
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('525186fd-f01b-846b-61bf-c814c132f729', '8ef2c00c-8472-fe20-c5a3-5e090f71bc82', '1.1.1', 'ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )', 'SV', 1, 30747.7800, 'TORRE', 14403.4400, 16344.3400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0c0e44a4-a61a-8f5a-651c-a35daf0e38d2', 'efe17ea8-dee6-6267-d7ac-0738c6349726', '1.2.1', 'ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )', 'SV', 1, 8895.4100, 'TORRE', 6453.2100, 2442.2000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0a40650e-7f3b-1ff8-c914-a8ec83d73d08', '266d1573-d5ac-c3ae-8d44-502d8749f403', '1.3.1', 'ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )', 'SV', 1, 348931.3900, 'TORRE', 320380.4500, 28550.9400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('de5cb70f-26ed-83b8-cafa-f6d084ad1676', '044dc6cd-0d66-b7d0-3634-4151b60df888', '1.4.1', 'SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)', 'SV', 1, 26909.5200, 'TORRE', 10523.6800, 16385.8400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6c150539-45dc-0b78-2e46-766b12251f17', '8eba7215-c8aa-6161-acff-9bb32f9b5184', '1.5.1', 'SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )', 'SV', 1, 20114.2800, 'TORRE', 14837.1500, 5277.1300);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c6a9b064-9985-e66c-46c5-ba82f60eecb8', '1ac1df64-6152-a2da-c04e-618085b57d2f', '1.6.1', 'SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )', 'SV', 1, 159374.2400, 'TORRE', 146668.2000, 12706.0400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('637934c5-31e6-a843-80c5-1d7bf7170c36', '7d07ff97-0de8-bb33-ede6-78817ba09e57', '1.7.1', 'SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG''s )', 'SV', 1, 54905.3800, 'TORRE', 43816.4800, 11088.9000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('148dd896-485d-7a05-5914-858e3d98f7b2', 'ef9a06aa-f2b0-be4e-fb89-956218f54a1d', '1.8.1', 'SUBESTAÇÃO PMUC - QUADROS ( CPG''s )', 'SV', 1, 124927.7600, 'TORRE', 119977.3600, 4950.4000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1861dcc2-30f6-40d1-68f6-797568c58874', '25b156a4-20e8-253f-b373-f074f23abbc9', '1.9.1', 'SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )', 'SV', 1, 23906.8600, 'TORRE', 12009.3900, 11897.4700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8e345d5c-0ebc-69ea-76f1-bfa31861c606', '0489db72-268a-fb54-89e0-8874482155bd', '1.10.1', 'SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )', 'SV', 1, 10610.2500, 'TORRE', 7838.0200, 2772.2300);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('afec1c02-3a07-0c32-efe1-b7470878bcb6', '61cccd8a-a01e-4ace-5a10-e4369540a6a0', '1.11.1', 'SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )', 'SV', 1, 77888.6000, 'TORRE', 71783.1000, 6105.5000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('24473397-2cc1-019a-3c72-c7000f5fa038', '3ebe4212-e8c7-8813-8f55-9c78a651b380', '1.12.1', 'SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG'')', 'SV', 1, 27452.6900, 'TORRE', 21908.2400, 5544.4500);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('639d3519-78b4-791b-177f-f6e069d6b1ab', 'ac90b5b8-1dc0-8cd8-976e-b5243b18c52e', '1.13.1', 'SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )', 'SV', 1, 35721.4400, 'TORRE', 32751.2000, 2970.2400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d8ad3ffd-2878-1d5c-b281-2afcffcbff52', '68616ce3-cdad-e947-330b-15286b9091ca', '1.14.1', 'ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )', 'SV', 1, 25619.6700, 'TORRE', 15472.4000, 10147.2700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5e85c6d1-4143-0038-b76f-d7aec7ebcd9d', '488d62b0-ccd2-cef1-864f-cf39a7158e52', '2.1.1', 'GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )', 'SV', 1, 446509.1700, 'TORRE', 431063.7000, 15445.4700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('fd153b2b-f708-9b0b-a569-cf1d5c551877', '58a685be-9ae6-9ee0-a9f5-9dda93c29765', '2.2.1', 'GRUPO GERADOR PMUC  - PAINEIS (  QTA''s + Quadros reversão )', 'SV', 1, 389851.3000, 'TORRE', 352689.9000, 37161.4000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('df2e3889-45fd-d161-c476-69f88889a0b0', '3b6cee64-f2c3-034f-f42a-ab141c104e89', '2.3.1', 'GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )', 'SV', 1, 60941.7800, 'TORRE', 25823.4900, 35118.2900);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9215754a-0af6-26b6-4a5e-f302750f9265', '884bae01-1bb7-a5a7-25a2-05761410adf4', '2.4.1', 'GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO', 'SV', 1, 144019.2700, 'TORRE', 115009.9000, 29009.3700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('69207951-02b7-7d2c-fe78-55c38655b0fe', '4ba9c271-6a02-2bba-96eb-0b42bd8eb222', '2.5.1', 'GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )', 'SV', 1, 431053.3700, 'TORRE', 415311.0900, 15742.2800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('893f1da6-461a-99ed-5a2b-b1fc9ead37c1', '0380b53f-f8aa-f6f0-3ec5-f7dad1059e89', '2.6.1', 'GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )', 'SV', 1, 113013.6100, 'TORRE', 101132.6400, 11880.9700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('86835042-f52c-0f06-0040-5361bf56db29', '04c06583-f0b5-4595-848d-f824d478f887', '2.7.1', 'GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )', 'SV', 1, 63561.8900, 'TORRE', 38592.1300, 24969.7600);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3e1f3971-f2d2-f9cf-9ef9-4db533e7f01a', '0a435407-69d6-be27-b3d2-396c341bf920', '2.8.1', 'GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO', 'SV', 1, 175705.2800, 'TORRE', 124191.1000, 51514.1800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ae306829-3737-e695-fa14-959e8ae93799', '3d7ad1e1-bcf9-eb8a-4a4a-7ea2ce05bf90', '2.9.1', 'GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO', 'SV', 1, 9800.5600, 'TORRE', 6199.9700, 3600.5900);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('834314cd-09b8-7d6d-b766-795848d1ab4b', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.1', 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04', 'SV', 1, 31375.9300, 'SS4', 17732.8900, 13643.0400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('55d373a3-4cf2-824b-9918-234e4c789563', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.2', 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03', 'SV', 1, 31524.6200, 'SS3', 17876.2700, 13648.3500);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1e103c5a-7e66-d965-c6e7-389d2c919ebc', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.3', 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02', 'SV', 1, 36467.2700, 'SS2', 18778.3700, 17688.9000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('07b1295d-eeeb-ee2b-77c6-630e9042b8d6', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.4', 'INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01', 'SV', 1, 29816.7400, 'SS1', 10311.0500, 19505.6900);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f1788455-9f80-eee4-46a5-9d990b572962', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.5', 'INFRA ALIMENTAÇÃO ELÉTRICA - TERREO', 'SV', 1, 108459.5900, 'TÉRREO', 41868.9100, 66590.6800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('808bdd59-632d-1c86-7aeb-be30931641c5', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.6', 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01', 'SV', 1, 27705.7800, 'G1', 16006.5400, 11699.2400);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b93d43c3-f8af-b302-d3e2-36d499a1d363', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.7', 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02', 'SV', 1, 36685.7400, 'G2', 22199.5200, 14486.2200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('97d2357b-f636-d61c-2b14-f0785ec1b28e', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.8', 'INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03', 'SV', 1, 32496.6400, 'G3', 18749.9300, 13746.7100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6c52f832-37b5-4edc-ac60-800016305e03', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.9', 'INFRA ALIMENTAÇÃO ELÉTRICA - LAZER', 'SV', 1, 12656.0100, 'LAZER', 4351.1400, 8304.8700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1a11188f-31dc-f804-cc43-727110d7804e', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.10', 'INFRA ALIMENTAÇÃO ELÉTRICA - PANORAMICO', 'SV', 1, 7552.3800, 'PANORÂMICO', 2404.3500, 5148.0300);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('39b922ce-2342-db4c-c74e-042a214cc2db', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.11', 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )', 'SV', 36, 8483.4550, 'TIPO', 3635.8050, 4847.6500);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('26ceaabe-5213-26ff-9482-916618ceddb6', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.12', 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA', 'SV', 1, 8152.7700, 'COBERTURA', 4836.9000, 3315.8700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('42109d1e-9dbb-5e18-bb22-f52b39b26706', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.13', 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 5600.7300, 'ROOFTOP', 2800.7800, 2799.9500);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a13b7b2a-091f-57d5-0082-1b9344ffba42', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.14', 'INFRA ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS', 'SV', 1, 11403.6200, 'CASA DE MÁQ.', 7403.6200, 4000.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9fdec6ff-72ad-490c-913b-66ffe776ba4a', 'c04079ee-6333-6e19-0a4f-0b442bc26f45', '3.1.15', 'INFRA ALIMENTAÇÃO ELÉTRICA - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )', 'SV', 50, 1122.4762, 'PAVIMENTOS', 796.5242, 325.9520);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('99a59438-e4b8-fec9-910f-8b777a2137ce', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.1', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04', 'SV', 1, 6697.5320, 'SS4', 3905.5120, 2792.0200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e6565241-139e-da51-a9f1-11a83d6f11bd', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.2', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03', 'SV', 1, 2921.2673, 'SS3', 1703.4680, 1217.7993);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ecf7a186-432d-1ce4-019d-e0fdb3e7d29b', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.3', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02', 'SV', 1, 2707.5160, 'SS2', 1578.8240, 1128.6920);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8a9f3d5c-e1c2-aabf-de20-d8a22f4fe772', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.4', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01', 'SV', 1, 4916.2791, 'SS1', 2866.8120, 2049.4671);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('615d2341-8391-2c6c-8712-8f577ad0ceb7', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.5', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - TERREO', 'SV', 1, 354941.8333, 'TÉRREO', 267085.0600, 87856.7733);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('65cc5ab0-0223-df53-33c1-0e919eb870e5', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.6', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01', 'SV', 1, 1068.7563, 'G1', 623.2200, 445.5363);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a5384845-24bf-766d-7f18-ba3fd733e469', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.7', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02', 'SV', 1, 855.0051, 'G2', 498.5760, 356.4291);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2974e1f6-9435-90d9-315d-c2d55342efaa', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.8', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03', 'SV', 1, 1389.3832, 'G3', 810.1860, 579.1972);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6043e90c-767f-a828-097c-4433cc76a76a', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.9', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - LAZER', 'SV', 1, 4110.9563, 'LAZER', 2650.6700, 1460.2863);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('fb7c08ef-22f1-1110-8c9a-ac599b5247b3', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.10', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PANORAMICO', 'SV', 1, 15904.9734, 'PANORÂMICO', 11759.0750, 4145.8984);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2c1e41af-cae2-4ef2-26b4-c3c0231ca597', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.11', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )', 'SV', 36, 27510.1200, 'TIPO', 15098.0000, 12412.1200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('4eff8b5b-0aec-05cf-e3e7-56c28da5f94b', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.12', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA', 'SV', 1, 57694.5772, 'COBERTURA', 44719.5694, 12975.0078);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3eea0d76-f5f7-1ed3-900c-ab791ffd5312', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.13', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 69525.4873, 'ROOFTOP', 49315.8350, 20209.6523);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9ab7875e-ad01-dd19-b948-c1c3ebf1c0ea', 'c2d03d67-2239-1d36-b037-836252535dc5', '3.2.14', 'CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS', 'SV', 1, 280489.2280, 'CASA DE MÁQ.', 210059.9374, 70429.2906);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('13a8a974-c37b-21ac-969a-31ed3ceebec7', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.1', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 25558.4126, 'SS4', 4456.9438, 21101.4688);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5611a051-8eca-e6aa-1285-73489cf3b14b', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.2', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03', 'SV', 1, 23253.4032, 'SS3', 3183.5312, 20069.8720);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0a4f70db-414f-a771-8e72-11b441cf13c4', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.3', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02', 'SV', 1, 23253.4032, 'SS2', 3183.5312, 20069.8720);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('cf566d8d-987f-fb5e-891c-95b383d83aa4', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.4', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01', 'SV', 1, 23253.4032, 'SS1', 3183.5312, 20069.8720);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c119608e-1c33-7a59-c576-5caf0760cf9b', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.5', 'INFRA DISTRIBUIÇÃO ELÉTRICA - TERREO', 'SV', 1, 60458.8484, 'TÉRREO', 8277.1812, 52181.6672);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f7e856cf-bb0a-9d31-f728-2a1b71e43e60', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.6', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01', 'SV', 1, 25904.0839, 'G1', 3820.2375, 22083.8464);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('74265f01-dcb5-dfa8-e466-b675a3e86e05', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.7', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02', 'SV', 1, 26685.7226, 'G2', 2546.8250, 24138.8976);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('05b132dc-a9d1-066f-879c-8f168b6faad1', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.8', 'INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03', 'SV', 1, 25904.0839, 'G3', 3820.2375, 22083.8464);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('93d1ae5a-1456-76f0-9f69-83c2ffa16201', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.9', 'INFRA DISTRIBUIÇÃO ELÉTRICA - LAZER', 'SV', 1, 31808.1678, 'LAZER', 7640.4750, 24167.6928);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c4f82a53-66d0-d8b6-30ae-86414c4786f8', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.10', 'INFRA DISTRIBUIÇÃO ELÉTRICA - PANORAMICO', 'SV', 1, 23621.4452, 'PANORÂMICO', 5093.6500, 18527.7952);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('de5d13e8-36b7-96af-1823-7fe9cebfe8cb', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.11', 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )', 'SV', 36, 5535.2739, 'TIPO', 1910.1187, 3625.1552);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1901aea0-a62b-8b1d-1c45-053f4e2482e1', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.12', 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA', 'SV', 1, 5536.0419, 'COBERTURA', 1910.1187, 3625.9232);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('858a5d22-073a-eb6f-f39c-a2454a65b751', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.13', 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 19725.1678, 'ROOFTOP', 7640.4750, 12084.6928);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('143b542b-92f1-0bf0-7d9a-d20020d15025', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.14', 'INFRA DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS', 'SV', 1, 10602.7226, 'CASA DE MÁQ.', 2546.8250, 8055.8976);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0ca55bf5-7755-4b8e-74d7-22a5c28d2f05', '01fdc05a-78ec-2a68-4f75-5df05cf7d050', '4.1.15', 'INFRA DISTRIBUIÇÃO ELÉTRICA - HELIPONTO', 'SV', 1, 5301.3613, 'HELIPONTO', 1273.4125, 4027.9488);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2d549b40-d7f2-730d-263f-8aed085b173b', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.1', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 16149.8916, 'SS4', 6927.1458, 9222.7458);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a95e4db1-fc11-cc76-ba19-5e7c65803e17', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.2', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03', 'SV', 1, 12464.2082, 'SS3', 4947.9613, 7516.2470);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('65c91b8d-4034-51ea-93eb-6f5c5fe8b535', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.3', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02', 'SV', 1, 12464.2082, 'SS2', 4947.9613, 7516.2470);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e76356c1-876a-2e6f-88b0-414e806f8648', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.4', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01', 'SV', 1, 12464.2082, 'SS1', 4947.9613, 7516.2470);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3e18ef6a-032e-6138-cd2f-1685555e367d', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.5', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO', 'SV', 1, 46750.9414, 'TÉRREO', 12864.6993, 33886.2422);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b6a6c2a5-f7cf-630f-485b-45703e7c3b40', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.6', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01', 'SV', 1, 22557.0499, 'G1', 5937.5535, 16619.4964);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e3219e76-8755-a001-95c4-45700c8f9992', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.7', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02', 'SV', 1, 18371.3666, 'G2', 3958.3690, 14412.9976);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('76ca1ae0-7e06-1ece-ec04-896e8fe46a18', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.8', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03', 'SV', 1, 22557.0499, 'G3', 5937.5535, 16619.4964);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('358a4978-ee09-6667-d8dd-17eaaaa2defb', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.9', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER', 'SV', 1, 35114.0998, 'LAZER', 11875.1070, 23238.9928);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('229e50eb-755e-f70d-3fda-b4845d27f91f', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.10', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO', 'SV', 1, 16742.7332, 'PANORÂMICO', 7916.7380, 8825.9952);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('00c56021-a67c-6a1a-3217-b274df138808', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.11', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )', 'SV', 36, 4624.5249, 'TIPO', 2368.7767, 2255.7482);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3efbfe34-49cb-6df8-1461-ca43fc0c31b9', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.12', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA', 'SV', 1, 4778.5249, 'COBERTURA', 2368.7767, 2409.7482);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('aaf27848-7ed2-57d8-ffac-6923febdce2d', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.13', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 19114.0998, 'ROOFTOP', 11875.1070, 7238.9928);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e161fa73-26f8-50bd-e675-7bdf5f1c55b6', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.14', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS', 'SV', 1, 8371.3666, 'CASA DE MÁQ.', 3958.3690, 4412.9976);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b736728a-e644-0502-b097-f66b9c74c0c1', 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352', '4.2.15', 'CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - HELIPONTO', 'SV', 1, 4185.6833, 'HELIPONTO', 1979.1845, 2206.4988);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('52f9e24f-f4a0-7177-9d93-4a8fd17e46a7', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.1', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 1763.6202, 'SS4', 633.4429, 1130.1772);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8f8ce7d9-6803-92ab-9b39-e8936102960c', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.2', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03', 'SV', 1, 1371.7046, 'SS3', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9626c2c8-b091-33c8-5fc9-0ac6983ab867', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.3', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02', 'SV', 1, 1371.7046, 'SS2', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('38e859fc-5437-5131-fdd9-d5820737243e', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.4', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01', 'SV', 1, 1371.7046, 'SS1', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6c04a3cf-ab1f-44d9-4402-c82bbc97ebc0', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.5', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO', 'SV', 1, 3723.1982, 'TÉRREO', 1337.2685, 2385.9297);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('23fdbfe7-c99d-d712-a67e-7823c7392d3a', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.6', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01', 'SV', 1, 1371.7046, 'G1', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('afc9c502-cc25-0099-39f6-0d000fdb0db3', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.7', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02', 'SV', 1, 1371.7046, 'G2', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('60293fcf-e48b-35ed-bf60-dec7222d841b', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.8', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03', 'SV', 1, 1371.7046, 'G3', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('31fc22a9-f0f6-a687-8eb7-11d356ffdc29', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.9', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER', 'SV', 1, 2155.5358, 'LAZER', 774.2081, 1381.3277);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6d533e98-f0ad-a317-1bab-b786f32cb336', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.10', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO', 'SV', 1, 3527.2404, 'PANORÂMICO', 1266.8859, 2260.3545);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3f9cb4d0-b692-f7b2-00a6-b52f78967cb1', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.11', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )', 'SV', 36, 391.9156, 'TIPO', 140.7651, 251.1505);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a2ee3a39-2947-cc2f-8543-b968bd82b832', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.12', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA', 'SV', 1, 391.9156, 'COBERTURA', 140.7651, 251.1505);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('88458404-9e1e-8db3-2ab3-4affea10b890', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.13', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 3919.1560, 'ROOFTOP', 1407.6510, 2511.5050);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8520fbf9-b023-fd8a-3d1c-83bddbf4d028', 'f0af7843-372d-e1b8-3165-ad02d22bed0f', '4.3.14', 'ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS', 'SV', 1, 1371.7046, 'CASA DE MÁQ.', 492.6779, 879.0268);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b4540b7e-d023-7c3a-b76b-5e062e70bddc', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.1', 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 12927.3084, 'SS4', 0.0000, 12927.3084);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d85b9dbe-45f2-89e0-a17b-b715e7e72892', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.2', 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 03', 'SV', 1, 15800.0436, 'SS3', 0.0000, 15800.0436);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('db81856f-68de-3a91-a114-de0f7e2b8a48', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.3', 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 02', 'SV', 1, 15800.0436, 'SS2', 0.0000, 15800.0436);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2c18b53d-9abf-bc2c-fdd4-0b0aaaff7c86', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.4', 'INSTALAÇÕES LUMINÁRIAS - SUBSOLO 01', 'SV', 1, 14363.6760, 'SS1', 0.0000, 14363.6760);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('20cbe747-0389-1bb1-0afa-7def2d184b57', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.5', 'INSTALAÇÕES LUMINÁRIAS - TERREO', 'SV', 1, 22981.8816, 'TÉRREO', 0.0000, 22981.8816);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('cac351fa-17d7-1e03-d761-46e868660371', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.6', 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 01', 'SV', 1, 20109.1464, 'G1', 0.0000, 20109.1464);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f8d9b6c8-ea02-bd7c-acc6-dc4a71a218f9', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.7', 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 02', 'SV', 1, 17236.4112, 'G2', 0.0000, 17236.4112);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1e9aba0f-8a37-fc99-eada-501b34c53081', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.8', 'INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 03', 'SV', 1, 8618.2056, 'G3', 0.0000, 8618.2056);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2de3caf5-3a03-f064-bad3-40f978813bc6', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.9', 'INSTALAÇÕES LUMINÁRIAS - LAZER', 'SV', 1, 43091.0280, 'LAZER', 0.0000, 43091.0280);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9ad8642c-a52b-8f1c-a1dd-4cb6030a4004', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.10', 'INSTALAÇÕES LUMINÁRIAS - PANORAMICO', 'SV', 1, 17236.4112, 'PANORÂMICO', 0.0000, 17236.4112);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('90a6cb77-5bf6-384d-57d7-212c610538f3', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.11', 'INSTALAÇÕES LUMINÁRIAS - PAV TIPO ( 1° AO 36 )', 'SV', 36, 1436.3676, 'TIPO', 0.0000, 1436.3676);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b9777bc5-d29b-8e0e-b4f2-63237239fbe3', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.12', 'INSTALAÇÕES LUMINÁRIAS- PAV COBERTURA', 'SV', 1, 1436.3676, 'COBERTURA', 0.0000, 1436.3676);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('dd8e48ed-c1c8-bf24-3886-e94a5fe9cc84', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.13', 'INSTALAÇÕES LUMINÁRIAS- PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 28727.3520, 'ROOFTOP', 0.0000, 28727.3520);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f8429963-ac84-b043-6381-e632223329a7', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.14', 'INSTALAÇÕES LUMINÁRIAS - PAV CASA DE MAQUINAS', 'SV', 1, 14363.6760, 'CASA DE MÁQ.', 0.0000, 14363.6760);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('01bbe107-679e-7b3d-beea-2503c6ccb5c9', 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa', '5.1.15', 'INSTALAÇÕES LUMINÁRIAS - HELIPONTO', 'SV', 1, 2872.7352, 'HELIPONTO', 0.0000, 2872.7352);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7633302f-0aa9-89f0-ff44-6d190932950b', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.1', 'QUADROS - SUBSOLO 04 + SUBSOLO 05 (QL 4 SUB - QF EX  4 SUB - QB DREN - QB IRRIG)', 'SV', 1, 38342.9500, 'SS4', 16103.9300, 22239.0200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5002d393-87cf-85dd-906d-1515a162b3e1', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.2', 'QUADROS - SUBSOLO 03 (QL 3 SUB - QF EX  3 SUB)', 'SV', 1, 22236.8560, 'SS3', 8117.3400, 14119.5160);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a8885c50-38ca-003f-f26f-674743168fe7', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.3', 'QUADROS - SUBSOLO 02 (QL 2 SUB - QF EX  2 SUB)', 'SV', 1, 22391.1090, 'SS2', 8271.5930, 14119.5160);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3f729071-c178-7496-58c6-764bf655759b', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.4', 'QUADROS - SUBSOLO 01 (QL 1 SUB - QF EX  1 SUB - QB ESPELHO)', 'SV', 1, 28442.5840, 'SS1', 12263.3100, 16179.2740);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('fbfb409d-ca89-c5a7-fd9a-433510638a31', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.5', 'QUADROS -TERREO (CM - QL GUA - QL TER - QD EMG - QB PRESS ESC E QB REC SEC)', 'SV', 1, 426460.3258, 'TÉRREO', 354832.8669, 71627.4589);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8b7c3c80-331a-e25c-2007-895919d13f69', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.6', 'QUADROS - SOBRESOLO 01 (QL 1 SOBR)', 'SV', 1, 19052.4599, 'G1', 3992.7019, 15059.7580);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6e27debf-2f26-54df-2c6a-282ebd835404', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.7', 'QUADROS - SOBRESOLO 02 (QL 2 SOBR E QDC)', 'SV', 1, 26673.2462, 'G2', 10897.0232, 15776.2230);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6ce4fd40-74be-60a3-760e-a6b77caa4399', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.8', 'QUADROS - SOBRESOLO 03 (QL 3 SOBR E QB PISC)', 'SV', 1, 21882.0971, 'G3', 5762.5812, 16119.5160);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6f629ac8-d241-cc0a-cdc5-f7108b04d1e3', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.9', 'QUADROS - LAZER (QL 3 SOBR E QB PISC)', 'SV', 1, 28608.1188, 'LAZER', 13115.4308, 15492.6880);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('608bb2ae-1d47-080a-2234-70853f3a4e96', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.10', 'QUADROS - PANORAMICO (QL PAN - QL FAC - QEUDE)', 'SV', 1, 33792.4085, 'PANORÂMICO', 17269.8415, 16522.5670);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('719954fb-24fc-9627-2348-3461cd17037f', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.11', 'QL TIPO (36 VEZES)', 'SV', 36, 6515.3520, 'TIPO', 4397.7053, 2117.6466);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ea326af7-2b97-ce41-0a5d-167ce53df1cd', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.12', 'QUADROS - COBERTURA (QL COBERT - QB SUPERIOR)', 'SV', 1, 12672.4931, 'COBERTURA', 7740.8752, 4931.6179);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d233f242-ffd3-6e5f-d649-64a640a4d707', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.13', 'QUADROS MEZANINO (QL ROOFT - QFAC ROOTF - QL PAV 2)', 'SV', 1, 24845.4365, 'ROOFTOP', 18151.2230, 6694.2135);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f041ff9c-a44f-43f5-1a38-4dfa12d10414', '974ed740-1cc7-805e-96ef-4afc0e6e0113', '6.1.14', 'QUADROS CASA MAQUINAS (QL ROOFT - QFAC ROOTF - QL PAV 2)', 'SV', 1, 33986.3129, 'CASA DE MÁQ.', 26687.5229, 7298.7900);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('61221afb-a094-e8cd-8e1a-912b1aa3409c', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.1', 'INFRA DADOS - SUBSOLO 04', 'SV', 1, 6556.0274, 'SS4', 3221.8660, 3334.1614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('813f03bc-f1db-4527-d439-c18138b8f1d7', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.2', 'INFRA DADOS  - SUBSOLO 03', 'SV', 1, 8334.0411, 'SS3', 4832.7990, 3501.2421);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1cb62310-9eaa-06e3-87ad-4ac4af9b7633', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.3', 'INFRA DADOS  - SUBSOLO 02', 'SV', 1, 8334.0411, 'SS2', 4832.7990, 3501.2421);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('91efc0fa-c293-b07e-54b0-94fe9f34ca60', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.4', 'INFRA DADOS  - SUBSOLO 01', 'SV', 1, 11112.0548, 'SS1', 6443.7320, 4668.3228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3b107a75-3577-cc6f-9feb-fcd3bdbdd8f2', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.5', 'INFRA DADOS  - TERREO', 'SV', 1, 33890.0685, 'TÉRREO', 8054.6650, 25835.4035);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d9e14e2d-1a95-1d52-e7b4-e5cddc0fcc68', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.6', 'INFRA DADOS  - SOBRESOLO 01', 'SV', 1, 15556.0274, 'G1', 3221.8660, 12334.1614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e95f0cd8-4788-6534-37fd-717762c57059', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.7', 'INFRA DADOS - SOBRESOLO 02', 'SV', 1, 16945.0343, 'G2', 4027.3325, 12917.7018);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('075697ce-56cd-e541-b59c-d0cf34ea974b', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.8', 'INFRA DADOS  - SOBRESOLO 03', 'SV', 1, 13745.0343, 'G3', 4027.3325, 9717.7018);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3b112c2a-91b9-fd46-4ca0-93338fbb0c82', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.9', 'INFRA DADOS  - LAZER', 'SV', 1, 2778.0137, 'LAZER', 1610.9330, 1167.0807);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('82fcb007-c27f-c60d-dda5-91b20d162e2d', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.10', 'INFRA DADOS  - PAV TIPO ( 1° AO 36 )', 'SV', 36, 4256.0274, 'TIPO', 2721.8660, 1534.1614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('4d1ccc53-72f7-19db-3ed6-13acf999ae9e', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.11', 'INFRA DADOS  - PAV COBERTURA', 'SV', 1, 4556.0274, 'COBERTURA', 3221.8660, 1334.1614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c5ae9549-7439-00c7-de8a-64115d3d99ff', 'bc83b534-3546-81e3-d7bb-8c3e6902729e', '7.1.12', 'INFRA DADOS  - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 2778.0137, 'ROOFTOP', 1610.9330, 1167.0807);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f8b912e9-411f-f29b-d88b-79883f3e9325', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.1', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PRUMADA VERTICAL ( Dividida em vãos - 48 vãos do 1° subsolo ate a coberta  )', 'SV', 48, 14236.9293, 'PAVIMENTOS', 5907.7901, 8329.1392);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a8a20521-0bbe-800c-1eed-cb3e8ba88808', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.2', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 04 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )', 'SV', 1, 6833.7261, 'SS4', 3123.7393, 3709.9868);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f11f4e69-e637-69ef-a9ec-33ca1223e556', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.3', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 03 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )', 'SV', 1, 6833.7261, 'SS3', 3123.7393, 3709.9868);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('573ea429-e6e2-5d39-9ffc-81e0f52f2aed', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.4', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 02 (  DRENO AR CONDICIONADO )', 'SV', 1, 2401.0500, 'SS2', 1100.4700, 1300.5800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('530d7038-693d-5394-6058-00c45b2e982b', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.5', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 01 (  DRENO AR CONDICIONADO )', 'SV', 1, 2401.0500, 'SS1', 1100.4700, 1300.5800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7e19457d-f4d7-082d-5226-0dfc66832741', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.6', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - TERREO', 'SV', 1, 68337.2605, 'TÉRREO', 31237.3925, 37099.8680);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5951ca26-7279-2d78-2c97-ac5a4dde8179', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.7', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 01', 'SV', 1, 13667.4521, 'G1', 6247.4785, 7419.9736);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b791f813-bfff-72f2-c05d-85e455382823', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.8', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 02', 'SV', 1, 27334.9042, 'G2', 12494.9570, 14839.9472);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6a69b05a-6c3c-66cf-d202-1f611e8dc06b', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.9', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 03', 'SV', 1, 13667.4521, 'G3', 6247.4785, 7419.9736);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ee611bcb-96ba-9d73-157a-1b8123eae463', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.10', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - LAZER', 'SV', 1, 68337.2605, 'LAZER', 31237.3925, 37099.8680);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0636514c-2cb3-cc89-6734-14b4b19c2be6', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.11', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PANORAMICO', 'SV', 1, 27334.9042, 'PANORÂMICO', 12494.9570, 14839.9472);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('44f2f189-212c-6fa1-452d-5fa142974487', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.12', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - 1° PAVIMENTO ( TIPO )', 'SV', 1, 27334.9042, '1º TIPO', 12494.9570, 14839.9472);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('303afb26-1284-ed0e-5778-f1a87e1c53d1', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.13', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - PAVIMENTO TIPO  ( 2° AO 36° PAV )', 'SV', 35, 10933.9617, 'TIPO', 4997.9828, 5935.9789);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a0559505-0b3c-1fbe-ff5f-a156bc663a8a', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.14', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - COBERTURA', 'SV', 1, 13667.4521, 'COBERTURA', 6247.4785, 7419.9736);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f3dd9192-f445-3339-b6da-f98319f0c96b', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.15', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - ROOFTOP + MEZANINO', 'SV', 1, 13667.4521, 'ROOFTOP', 6247.4785, 7419.9736);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b722bb4c-6240-bd12-5e3e-9f4cc891a9d9', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.16', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - CASA DE MAQUINA', 'SV', 1, 13667.4521, 'CASA DE MÁQ.', 6247.4785, 7419.9736);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c99df63f-d676-29a5-324d-94e6b33402bf', '46b91a6c-c77e-12f4-1be9-3de563613e04', '8.1.17', 'TUBOS E CONEXÕES - AGUAS PLUVIAIS - HELIPONTO', 'SV', 1, 6833.7261, 'HELIPONTO', 3123.7393, 3709.9868);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('49aa87f3-687d-2b6c-1873-53371edc94e6', '78cf38dd-10bd-8951-3e1b-f83d86fa17fb', '8.2.1', 'INSTALAÇÃO DE BOMBAS - DRENAGEM - AGUAS PLUVIAIS - SUBSOLO 4 ( TUBOS, CONEXÕES E VALVULAS  )', 'SV', 1, 50633.8000, 'TORRE', 39371.9900, 11261.8100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5c05d787-32ee-255d-c3b9-aedc7839e684', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.1', 'TUBOS E CONEXÕES - ESGOTO - PRUMADA VERTICAL ( Dividida em vãos entre pavimentos )', 'SV', 48, 15817.7813, 'PAVIMENTOS', 6816.4776, 9001.3037);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b14070a1-5780-7262-9b5f-2ef82ac586e4', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.2', 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 04', 'SV', 1, 9490.6688, 'SS4', 4359.8866, 5130.7823);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('4fb81c8b-d782-e61b-9229-a9b0cad9126a', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.3', 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 03', 'SV', 1, 9490.6688, 'SS3', 4359.8866, 5130.7823);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('285e3c1d-6f64-2660-b0e5-65ef53aa3b14', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.4', 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 02', 'SV', 1, 9490.6688, 'SS2', 4359.8866, 5130.7823);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('cd898607-330b-c3fe-cd53-9589ec9e7fca', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.5', 'TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 01', 'SV', 1, 9490.6688, 'SS1', 4359.8866, 5130.7823);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e1557603-1475-26ed-f00b-630b46ccb544', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.6', 'TUBOS E CONEXÕES - ESGOTO  - TERREO', 'SV', 1, 75925.3504, 'TÉRREO', 34879.0924, 41046.2580);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3495bd8f-1ffd-d969-a1a5-03ddd9028630', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.7', 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 01', 'SV', 1, 18981.3376, 'G1', 8719.7731, 10261.5645);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1fe828c1-e0d1-ff0f-d75c-ba1e3e612f82', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.8', 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 02', 'SV', 1, 28472.0064, 'G2', 13079.6596, 15392.3467);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c717cb04-b966-ffb8-b1e1-0b8a2395fbae', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.9', 'TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 03', 'SV', 1, 18981.3376, 'G3', 8719.7731, 10261.5645);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a9255d17-674a-d0ea-3472-d5490471c83f', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.10', 'TUBOS E CONEXÕES - ESGOTO  - LAZER', 'SV', 1, 28472.0064, 'LAZER', 13079.6596, 15392.3467);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('83f46ef9-7851-b507-1f12-faba56d1e2e9', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.11', 'TUBOS E CONEXÕES - ESGOTO  - PANORAMICO', 'SV', 1, 18981.3376, 'PANORÂMICO', 8719.7731, 10261.5645);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('cca72c2c-ef0b-acfd-5ea5-6b73c7041155', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.12', 'TUBOS E CONEXÕES - ESGOTO  - 1° PAVIMENTO ( TIPO )', 'SV', 1, 37962.6752, '1º TIPO', 17439.5462, 20523.1290);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('88141ad4-19d1-3e4a-9a07-aeaed7d74426', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.13', 'TUBOS E CONEXÕES - ESGOTO  - PAVIMENTO TIPO  ( 2° AO 36° PAV )', 'SV', 35, 22777.6051, 'TIPO', 10463.7277, 12313.8774);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1b562090-a89e-2153-1edb-fc155f69d42f', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.14', 'TUBOS E CONEXÕES - ESGOTO  - COBERTURA', 'SV', 1, 37962.6752, 'COBERTURA', 17439.5462, 20523.1290);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7c7d6d08-f1dc-358f-ee6b-dbbf6901261b', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.15', 'TUBOS E CONEXÕES - ESGOTO  - ROOFTOP + MEZANINO', 'SV', 1, 18981.3376, 'ROOFTOP', 8719.7731, 10261.5645);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('72e08627-0939-a6a0-745d-95d63b43ce15', '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e', '9.1.16', 'TUBOS E CONEXÕES - ESGOTO  - CASA DE MAQUINA', 'SV', 1, 18981.3376, 'CASA DE MÁQ.', 8719.7731, 10261.5645);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('88a6bcf9-4b4d-b5c6-bd5f-8993268ecec9', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.1', 'TUBOS E CONEXÕES - HIDRÁULICA - PRUMADA VERTICAL ( Dividida em vãos )', 'SV', 48, 7406.6454, 'PAVIMENTOS', 3846.2165, 3560.4289);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c7839940-a478-0d92-72e3-b96b0fbb1526', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.2', 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 04', 'SV', 1, 14220.7592, 'SS4', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a1faa77c-e084-1828-355b-f8ea2d24241f', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.3', 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 03', 'SV', 1, 14220.7592, 'SS3', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('4575f4d3-b446-522f-0cf1-72892e9f0a0b', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.4', 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 02', 'SV', 1, 14220.7592, 'SS2', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6f0e6ff7-3524-db1e-0adb-c1144a8a34bb', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.5', 'TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 01', 'SV', 1, 14220.7592, 'SS1', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('50bb095e-15a4-053b-dae2-70d2a71c4680', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.6', 'TUBOS E CONEXÕES - HIDRÁULICA  - TERREO', 'SV', 1, 71103.7960, 'TÉRREO', 36923.6785, 34180.1175);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('42476a00-526c-d5f9-fc34-76e5d2fac0ac', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.7', 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 01', 'SV', 1, 0.0000, 'G1', 0.0000, 0.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('344ca2e3-b6fe-8ddc-0256-d80991047672', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.8', 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 02', 'SV', 1, 14220.7592, 'G2', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('efa9706c-454f-c65b-bbf3-12e0eab677a3', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.9', 'TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 03', 'SV', 1, 28441.5184, 'G2', 14769.4714, 13672.0470);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('347ff725-c962-fa6f-7f56-adad334a0345', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.10', 'TUBOS E CONEXÕES - HIDRÁULICA  - LAZER', 'SV', 1, 21331.1388, 'LAZER', 11077.1035, 10254.0352);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d8b3c563-284e-c7d9-83fd-8a31bb07d681', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.11', 'TUBOS E CONEXÕES - HIDRÁULICA  - PANORAMICO', 'SV', 1, 14220.7592, 'PANORÂMICO', 7384.7357, 6836.0235);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2c4c1c61-165c-d568-436b-f359ea81ab3a', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.12', 'TUBOS E CONEXÕES - HIDRÁULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )', 'SV', 36, 21331.1388, 'TIPO', 11077.1035, 10254.0352);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6ae0709b-b23e-ab13-1f1d-77b2af635452', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.13', 'TUBOS E CONEXÕES - HIDRÁULICA  - COBERTURA', 'SV', 1, 28441.5184, 'COBERTURA', 14769.4714, 13672.0470);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b1435fe0-a814-477d-9401-c6078f1ee572', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.14', 'TUBOS E CONEXÕES - HIDRÁULICA  - ROOFTOP + MEZANINO', 'SV', 1, 7110.3796, 'ROOFTOP', 3692.3678, 3418.0118);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8438e3b3-016b-c9b5-1b81-24d4b2ea73bb', 'c003a631-a38e-3f20-3256-896e58f79191', '10.1.15', 'TUBOS E CONEXÕES - HIDRÁULICA  - CASA DE MAQUINA', 'SV', 1, 56883.0368, 'CASA DE MÁQ.', 29538.9428, 27344.0940);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0a5b36b8-2592-02cb-c35a-a7f5320d0ab8', 'cecf58c1-f4cd-c5c5-5629-f6daa349d302', '10.2.1', 'TUBOS E CONEXÕES - HIDRAULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )', 'SV', 36, 16806.6180, 'TIPO', 8506.6180, 8300.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3240226a-74d3-6e98-dff9-0ef159f255f6', 'cecf58c1-f4cd-c5c5-5629-f6daa349d302', '10.2.2', 'TUBOS E CONEXÕES - HIDRAULICA  - COBERTURA', 'SV', 1, 39821.6366, 'COBERTURA', 20415.8832, 19405.7534);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e63d6f4f-ac43-411e-a27d-51b22256355e', 'cecf58c1-f4cd-c5c5-5629-f6daa349d302', '10.2.3', 'TUBOS E CONEXÕES - HIDRAULICA  - CASA DE MAQUINAS', 'SV', 1, 28384.4444, 'CASA DE MÁQ.', 13610.5888, 14773.8556);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e33514ce-ccc9-7313-02e1-a76cf67b24fd', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.1', 'CONJUNTO HIDROMETROS APARTAMENTOS ( VALVULAS E CONEXÕES )', 'SV', 37, 2162.6600, 'TIPO', 1862.6600, 300.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8fb95b5b-13e9-5d33-b30b-82d43c1d26a6', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.2', 'CONJUNTO BOMBAS RECALQUE', 'SV', 1, 187034.6400, 'TORRE', 177133.8800, 9900.7600);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('67e509de-e623-6a53-c8bf-30d8830b9bbd', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.3', 'CONJUNTO BOMBAS PRESSURIZAÇÃO', 'SV', 1, 62990.6300, 'TORRE', 59030.3100, 3960.3200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7b7be2bd-dc80-eae4-51ab-5f64f0925179', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.4', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA F )', 'SV', 1, 55093.6400, 'TORRE', 35457.0300, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('50bb824e-0fb9-a025-5787-e739fc525ee7', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.5', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA G )', 'SV', 1, 55093.6400, 'TORRE', 35457.0300, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7f36868e-4f6a-9585-61d4-b88a4fff5454', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.6', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA CONDOMINIO )', 'SV', 1, 82225.0000, 'TORRE', 42951.7800, 39273.2200);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e57dfc5c-0bd4-cbbf-b314-8467a6ea8756', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.7', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA B )', 'SV', 1, 58943.5300, 'TORRE', 39306.9200, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b37c0cd5-fb61-65e9-8baf-9edf10c825ca', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.8', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA C )', 'SV', 1, 58505.2300, 'TORRE', 38868.6200, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8e6841a2-021e-4d36-d324-227adf3741f2', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.9', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA D )', 'SV', 1, 58527.5800, 'TORRE', 38890.9700, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c1974227-6761-7646-8fbd-c5b472aed818', 'abc9f4d1-f216-8143-436a-9acaedaa1dd9', '10.3.10', 'CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA E )', 'SV', 1, 58587.9500, 'TORRE', 38951.3400, 19636.6100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9c52a85c-dcc9-3bfe-7f43-503ddb9f67f0', '91657f80-e132-9315-56a9-760df5a77555', '12.1.1', 'TUBOS E CONEXÕES ( PVC SOLDAVEL E PPR )', 'SV', 1, 52263.3200, 'LAZER', 30263.3200, 22000.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9c52a85c-dcc9-3bfe-7f43-503ddb9f67f0', '91657f80-e132-9315-56a9-760df5a77555', '12.1.1', 'ACABAMENTOS ( RALOS DE FUNDO, ASPIRAÇÃO E RETORNO )', 'SV', 1, 8096.0600, 'LAZER', 6610.9300, 1485.1300);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9c52a85c-dcc9-3bfe-7f43-503ddb9f67f0', '91657f80-e132-9315-56a9-760df5a77555', '12.1.1', 'BARRILHETES E BOMBAS ( BOMBAS FILTROS E VALVULAS )', 'SV', 1, 68415.3700, 'LAZER', 52704.0000, 15711.3700);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7f411b3c-0286-bae4-eb96-3422a70dff00', '8cba73cb-ead5-c87f-9225-c96236e2ee09', '13.1.1', 'LOUÇAS E METAIS - PAVIMENTO TERREO', 'SV', 1, 2340.0793, 'TÉRREO', 0.0000, 2340.0793);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('72143052-b7a3-41cf-1103-76d6a36b5b7d', '8cba73cb-ead5-c87f-9225-c96236e2ee09', '13.1.2', 'LOUÇAS E METAIS - PAVIMENTO LAZER', 'SV', 1, 3240.1098, 'LAZER', 0.0000, 3240.1098);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('acb79fab-e741-fb5f-b09a-7ebce6fcce0e', '8cba73cb-ead5-c87f-9225-c96236e2ee09', '13.1.3', 'LOUÇAS E METAIS - PAVIMENTO PANORAMICO', 'SV', 1, 3240.1098, 'PANORÂMICO', 0.0000, 3240.1098);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('74e68edd-56dd-c71a-5240-6c4319bb17f2', '8cba73cb-ead5-c87f-9225-c96236e2ee09', '13.1.4', 'LOUÇAS E METAIS - PAVIMENTO ROOFTOP + MEZANINO', 'SV', 1, 8640.2928, 'ROOFTOP', 0.0000, 8640.2928);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6756b8d4-a77b-2a20-aa0a-4ca0ef69a427', '8cba73cb-ead5-c87f-9225-c96236e2ee09', '13.1.5', 'LOUÇAS E METAIS - PAVIMENTO CASA DE MAQ', 'SV', 1, 540.0183, 'CASA DE MÁQ.', 0.0000, 540.0183);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('71b8aa3a-9947-bbd4-08b2-14ed8c35c69e', '2f2c41b0-e82c-652c-bc14-0a71e60ec148', '13.2.1', 'LOUÇAS E METAIS - PAVIMENTO TIPO 1 AO 36', 'SV', 36, 2707.1745, 'TIPO', 1777.8110, 929.3635);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a1d14fa4-9ad4-737f-480d-1c60732df943', '2f2c41b0-e82c-652c-bc14-0a71e60ec148', '13.2.2', 'LOUÇAS E METAIS - COBERTURA', 'SV', 1, 10828.6980, 'COBERTURA', 7111.2440, 3717.4540);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2217596a-9430-77ef-42c5-d0deb170814f', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.1', 'TUBOS E CONEXÕES - HIDRANTE - PRUMADA VERTICAL ( Dividida em vãos )', 'SV', 48, 2146.2149, 'PAVIMENTOS', 1766.2149, 380.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('87bc0b2b-6e8a-ffab-7208-e74921e07263', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.2', 'TUBOS E CONEXÕES - HIDRANTE - PAV TIPO ( 1 ao 36 )', 'SV', 36, 1632.9719, 'TIPO', 1412.9719, 220.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d9a3581e-38d9-0ae0-3972-b66bde42889e', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.3', 'TUBOS E CONEXÕES - HIDRANTE - PAV COBERTURA', 'SV', 1, 4242.5510, 'COBERTURA', 2825.9438, 1416.6072);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('461e840e-977c-1cf9-17c2-7fb227c51f0d', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.4', 'TUBOS E CONEXÕES - HIDRANTE - PAV ROOFTOP + MEZANINO', 'SV', 1, 2121.2755, 'ROOFTOP', 1412.9719, 708.3036);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7eb6f174-6688-ce55-3395-e8ccf2e9d8f0', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.5', 'TUBOS E CONEXÕES - HIDRANTE - PAV CASA DE MAQUINA', 'SV', 1, 2121.2755, 'CASA DE MÁQ.', 1412.9719, 708.3036);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('67bd46a6-c061-86fc-3684-4fba521877b3', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.6', 'CAIXAS E ACESSORIOS - HIDRANTE - SUBSOLO 4 A0 PAV TIPO 36', 'SV', 46, 3276.4000, 'TIPO', 3159.4000, 117.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5b64856c-23d2-ebb4-fdbe-5b75f5552fee', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.7', 'CAIXAS E ACESSORIOS - HIDRANTE - PAV COBERTURA', 'SV', 1, 11696.8976, 'COBERTURA', 9688.8456, 2008.0520);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f2c503b7-28c9-7858-8bf4-b28c7b7a3f9b', '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f', '14.1.8', 'CAIXAS E ACESSORIOS - HIDRANTE - PAV ROOFTOP + MEZANINO', 'SV', 1, 7786.2584, 'ROOFTOP', 6459.5504, 1326.7080);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('4a1f46f2-94ea-e87d-ddcf-755671d42bb6', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.1', 'TUBOS E CONEXÕES - SPRINKLER - PRUMADA VERTICAL ( Dividida por  vãos entre pavimentos  )', 'SV', 48, 6452.2500, 'PAVIMENTOS', 6287.2400, 165.0100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6e927acf-d908-f1c5-72c9-f86d8d09ee45', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.2', 'TUBOS E CONEXÕES - SPRINKLER - CONJUNTO VALVULA REDUTORA DE PRESSÃO', 'SV', 2, 57547.0300, 'TOTAL', 56226.9200, 1320.1100);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a8bd7bf1-004d-9be8-5da0-145700c0c024', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.3', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 4', 'SV', 1, 80022.7770, 'SS4', 48107.2960, 31915.4810);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a5324ca6-c823-6d7a-38a3-9095d2fbce8e', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.4', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 3', 'SV', 1, 80022.7770, 'SS3', 48107.2960, 31915.4810);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('de02db03-ece4-ac2d-5186-258e9fe7be80', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.5', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 2', 'SV', 1, 80022.7770, 'SS2', 48107.2960, 31915.4810);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1933bcb8-9319-8289-c23a-e739933b5d7e', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.6', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 1', 'SV', 1, 80022.7770, 'SS1', 48107.2960, 31915.4810);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('92b0ee96-b366-cd92-63d9-46d2303e5602', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.7', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TERREO', 'SV', 1, 83223.6881, 'TÉRREO', 50031.5878, 33192.1002);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('310f005d-da07-8b73-b584-d3ee46a78637', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.8', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 1', 'SV', 1, 72020.4993, 'G1', 43296.5664, 28723.9329);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8269e36a-1cc5-3444-9edd-573dcd9f0e41', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.9', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 2', 'SV', 1, 64018.2216, 'G2', 38485.8368, 25532.3848);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0cc1c4ea-0505-6d4e-0bd8-d346872ab7ad', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.10', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 3', 'SV', 1, 56015.9439, 'G3', 33675.1072, 22340.8367);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ccb69dff-e52a-f15f-2951-cab39c22690f', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.11', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO LAZER', 'SV', 1, 24006.8331, 'LAZER', 14432.1888, 9574.6443);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1d6cdd58-097a-f60b-c6a4-00b33abff4df', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.12', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO PANORAMICO', 'SV', 1, 32009.1108, 'PANORÂMICO', 19242.9184, 12766.1924);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6fde1297-7ac9-5db7-3c25-229a7965b70a', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.13', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TIPO ( 1° ao 36° )', 'SV', 36, 1863.2189, 'TIPO', 1443.2189, 420.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b013b643-6452-34da-e015-12d9df931e91', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.14', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO COBERTURA', 'SV', 1, 6401.8222, 'COBERTURA', 3848.5837, 2553.2385);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d146b8ad-bd7e-be93-a26a-c15fc3c75984', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.15', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO ROOFTOP + MEZANINO', 'SV', 1, 28942.9184, 'ROOFTOP', 19274.0384, 9668.8800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('8a329833-d61d-0af2-6e80-7182de5468c2', 'e5977692-4f97-b012-e08e-d2df4cedd5d3', '14.2.16', 'TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO CASA DE MAQUINA', 'SV', 1, 24006.8331, 'CASA DE MÁQ.', 14432.1888, 9574.6443);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5260df93-e2e4-285c-62a6-bc4f93184da7', 'f7363bb4-052f-ce59-7ad2-e839a08717ee', '14.3.1', 'BARRILHETE BOMBAS - CASA DE MAQUINAS', 'SV', 1, 139226.8300, 'CASA DE MÁQ.', 114044.7500, 25182.0800);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('039cd75a-a6af-c0a7-bb73-a14207d94c85', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.1', 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 3026.5710, 'SS4', 1977.9105, 1048.6605);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5d550dad-9a5a-3e16-ce9c-a548f234af46', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.2', 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 03', 'SV', 1, 1815.9426, 'SS3', 1186.7463, 629.1963);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('db4150e2-0afa-266e-43af-d124bbadba4f', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.3', 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 02', 'SV', 1, 1815.9426, 'SS2', 1186.7463, 629.1963);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c44e2e18-789f-0db2-0ff6-ac854bf586b3', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.4', 'INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 01', 'SV', 1, 1815.9426, 'SS1', 1186.7463, 629.1963);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f430d86a-0503-fd18-ed22-3f9bb8d349a5', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.5', 'INSTALAÇÕES SINALIZAÇÃO - TERREO', 'SV', 1, 3631.8852, 'TÉRREO', 2373.4926, 1258.3926);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('519766ed-fc4d-bf98-c114-eaeeafec3305', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.6', 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 01', 'SV', 1, 2421.2568, 'G1', 1582.3284, 838.9284);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('fb34f6aa-e238-46a7-66c2-ce82885f95e4', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.7', 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 02', 'SV', 1, 2421.2568, 'G2', 1582.3284, 838.9284);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('30d3e067-def8-9d67-7711-41192fd4962b', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.8', 'INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 03', 'SV', 1, 1815.9426, 'G3', 1186.7463, 629.1963);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('55c2b428-0d2f-328a-69e4-61c1cc2750e3', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.9', 'INSTALAÇÕES SINALIZAÇÃO - LAZER', 'SV', 1, 2421.2568, 'LAZER', 1582.3284, 838.9284);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d6c0f785-e454-2995-0e60-242f91613c15', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.10', 'INSTALAÇÕES SINALIZAÇÃO - PANORAMICO', 'SV', 1, 1815.9426, 'PANORÂMICO', 1186.7463, 629.1963);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('42541437-76d1-29e9-370a-0d26621cf41d', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.11', 'INSTALAÇÕES SINALIZAÇÃO - PAV TIPO ( 1° AO 36 )', 'SV', 36, 907.9713, 'TIPO', 593.3732, 314.5981);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('466cdb23-1ae0-d979-2520-da5a200dbcb7', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.12', 'INSTALAÇÕES SINALIZAÇÃO- PAV COBERTURA', 'SV', 1, 1210.6284, 'COBERTURA', 791.1642, 419.4642);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a5e578e3-206a-d12e-14a9-20d6b358b7e7', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.13', 'INSTALAÇÕES SINALIZAÇÃO- PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 3026.5710, 'ROOFTOP', 1977.9105, 1048.6605);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b79c5bb8-e805-63e8-79ea-883247708fe9', 'e27bb86b-db5c-846c-6520-6b7b105951e0', '15.1.14', 'INSTALAÇÕES SINALIZAÇÃO - PAV CASA DE MAQUINAS', 'SV', 1, 605.3142, 'CASA DE MÁQ.', 395.5821, 209.7321);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('039cd75a-a6af-c0a7-bb73-a14207d94c85', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.1', 'INSTALAÇÕES EXTINTORES - SUBSOLO 04 + SUBSOLO 05', 'SV', 1, 3052.8415, 'SS4', 2604.5800, 448.2615);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5d550dad-9a5a-3e16-ce9c-a548f234af46', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.2', 'INSTALAÇÕES EXTINTORES - SUBSOLO 03', 'SV', 1, 2442.2732, 'SS3', 2083.6640, 358.6092);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('db4150e2-0afa-266e-43af-d124bbadba4f', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.3', 'INSTALAÇÕES EXTINTORES - SUBSOLO 02', 'SV', 1, 2442.2732, 'SS2', 2083.6640, 358.6092);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c44e2e18-789f-0db2-0ff6-ac854bf586b3', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.4', 'INSTALAÇÕES EXTINTORES - SUBSOLO 01', 'SV', 1, 2442.2732, 'SS1', 2083.6640, 358.6092);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f430d86a-0503-fd18-ed22-3f9bb8d349a5', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.5', 'INSTALAÇÕES EXTINTORES - TERREO', 'SV', 1, 3663.4098, 'TÉRREO', 3125.4960, 537.9138);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('519766ed-fc4d-bf98-c114-eaeeafec3305', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.6', 'INSTALAÇÕES EXTINTORES - SOBRESOLO 01', 'SV', 1, 3052.8415, 'G1', 2604.5800, 448.2615);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('fb34f6aa-e238-46a7-66c2-ce82885f95e4', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.7', 'INSTALAÇÕES EXTINTORES - SOBRESOLO 02', 'SV', 1, 2442.2732, 'G2', 2083.6640, 358.6092);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('30d3e067-def8-9d67-7711-41192fd4962b', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.8', 'INSTALAÇÕES EXTINTORES - SOBRESOLO 03', 'SV', 1, 2442.2732, 'G3', 2083.6640, 358.6092);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('55c2b428-0d2f-328a-69e4-61c1cc2750e3', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.9', 'INSTALAÇÕES EXTINTORES - LAZER', 'SV', 1, 2260.8000, 'LAZER', 1980.0000, 280.8000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d6c0f785-e454-2995-0e60-242f91613c15', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.10', 'INSTALAÇÕES EXTINTORES - PANORAMICO', 'SV', 1, 1831.7049, 'PANORÂMICO', 1562.7480, 268.9569);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('42541437-76d1-29e9-370a-0d26621cf41d', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.11', 'INSTALAÇÕES EXTINTORES - PAV TIPO ( 1° AO 36 )', 'SV', 36, 853.0525, 'TIPO', 726.3740, 126.6785);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('466cdb23-1ae0-d979-2520-da5a200dbcb7', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.12', 'INSTALAÇÕES EXTINTORES- PAV COBERTURA', 'SV', 1, 1221.1366, 'COBERTURA', 1041.8320, 179.3046);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a5e578e3-206a-d12e-14a9-20d6b358b7e7', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.13', 'INSTALAÇÕES EXTINTORES- PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 1831.7049, 'ROOFTOP', 1562.7480, 268.9569);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b79c5bb8-e805-63e8-79ea-883247708fe9', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.14', 'INSTALAÇÕES EXTINTORES - PAV CASA DE MAQUINAS', 'SV', 1, 1221.1366, 'CASA DE MÁQ.', 1041.8320, 179.3046);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2fa27309-d523-b095-1b11-cd45e4000c08', '6f1829f2-6813-0079-a9f3-7f285f5522a5', '15.1.15', 'INSTALAÇÕES EXTINTORES - HELIPONTO', 'SV', 1, 28880.0900, 'HELIPONTO', 28187.0300, 693.0600);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5a0544f4-dded-536f-db70-b8a9dfed4533', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.1', 'INFRA SDAI - SUBSOLO 04', 'SV', 1, 11216.0167, 'SS4', 4188.0937, 7027.9230);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a6aacd23-bbbc-cd6b-0fd3-f9574d301077', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.2', 'INFRA SDAI - SUBSOLO 03', 'SV', 1, 9613.7286, 'SS3', 3589.7946, 6023.9340);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('372b35ce-7998-a2eb-c8b8-2f580de2e722', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.3', 'INFRA SDAI - SUBSOLO 02', 'SV', 1, 9613.7286, 'SS2', 3589.7946, 6023.9340);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9b7044e8-2ab2-d16a-0946-8a1453bd57cd', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.4', 'INFRA SDAI - SUBSOLO 01', 'SV', 1, 9613.7286, 'SS1', 3589.7946, 6023.9340);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('ce25b52b-aba7-bfca-7a74-f0988f9bb4e2', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.5', 'INFRA SDAI - TERREO', 'SV', 1, 16022.8810, 'TÉRREO', 5982.9910, 10039.8900);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1065faa5-9434-5773-80f3-9937841257cf', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.6', 'INFRA SDAI - SOBRESOLO 01', 'SV', 1, 8011.4405, 'G1', 2991.4955, 5019.9450);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('40ad44c8-5718-d570-9417-4c0d76d1c610', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.7', 'INFRA SDAI - SOBRESOLO 02', 'SV', 1, 4806.8643, 'G2', 1794.8973, 3011.9670);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('04be831a-52b8-bde8-1e64-7992a8473b20', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.8', 'INFRA SDAI - SOBRESOLO 03', 'SV', 1, 4806.8643, 'G3', 1794.8973, 3011.9670);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('697984ed-048c-4e23-b48a-62e2a17fe1b5', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.9', 'INFRA SDAI - LAZER', 'SV', 1, 4806.8643, 'LAZER', 1794.8973, 3011.9670);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('151875bb-1e40-8fbd-2af5-abb511df3c6f', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.10', 'INFRA SDAI - PANORAMICO', 'SV', 1, 4806.8643, 'PANORÂMICO', 1794.8973, 3011.9670);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f5c026ad-b8ad-69d7-43df-6c03d7295a23', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.11', 'INFRA SDAI - PAV TIPO ( 1° AO 36 )', 'SV', 36, 1098.2991, 'TIPO', 598.2991, 500.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('e8fe448c-a149-ecc7-d6f4-426d44846c41', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.12', 'INFRA  SDAI - PAV COBERTURA', 'SV', 1, 2396.5982, 'COBERTURA', 1196.5982, 1200.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('09152054-6da5-12d4-dfac-3bb73c6b6bf8', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.13', 'INFRA SDAI - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 3594.8973, 'ROOFTOP', 1794.8973, 1800.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6ca32e6e-1f51-de93-bb97-e228d8a1cbdc', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.14', 'INFRA SDAI - PAV CASA DE MAQUINAS', 'SV', 1, 2931.5982, 'CASA DE MÁQ.', 1196.5982, 1735.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a25e4890-cccc-f50c-0dd3-0bfa826ec509', '4622febb-2ffc-d980-ed20-d64ef1103d48', '16.1.15', 'INFRA SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )', 'SV', 48, 166.9050, 'PAVIMENTOS', 62.3228, 104.5822);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('bd690acb-27f0-54a4-5b9d-d3c34e067a98', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.1', 'CABEAMENTO SDAI - SUBSOLO 04', 'SV', 1, 3640.3314, 'SS4', 1608.6858, 2031.6456);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f1944ec3-a3dc-b675-d202-84fb8872952c', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.2', 'CABEAMENTO SDAI - SUBSOLO 03', 'SV', 1, 3640.3314, 'SS3', 1608.6858, 2031.6456);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5de4bd8f-290f-d540-3690-20ca4dfff537', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.3', 'CABEAMENTO SDAI - SUBSOLO 02', 'SV', 1, 4247.0533, 'SS2', 1876.8001, 2370.2532);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d237ba35-02f5-d2c9-81d3-1b4b32fdc587', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.4', 'CABEAMENTO SDAI - SUBSOLO 01', 'SV', 1, 4247.0533, 'SS1', 1876.8001, 2370.2532);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('571a3b63-2e8c-c248-8c2c-b7759253cd63', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.5', 'CABEAMENTO SDAI - TERREO', 'SV', 1, 6188.5634, 'TÉRREO', 2734.7659, 3453.7975);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('53e9bf21-7556-dbff-8eba-475307772478', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.6', 'CABEAMENTO SDAI - SOBRESOLO 01', 'SV', 1, 3640.3314, 'G1', 1608.6858, 2031.6456);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c8f7ace9-c904-7785-ab93-436e08376e07', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.7', 'CABEAMENTO SDAI - SOBRESOLO 02', 'SV', 1, 1820.1657, 'G2', 804.3429, 1015.8228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c202c42a-ef71-3652-9e33-56311994c70f', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.8', 'CABEAMENTO SDAI - SOBRESOLO 03', 'SV', 1, 1820.1657, 'G3', 804.3429, 1015.8228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6aa2b917-ad16-c5eb-3454-b3a2880e1715', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.9', 'CABEAMENTO SDAI - LAZER', 'SV', 1, 1820.1657, 'LAZER', 804.3429, 1015.8228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d2362732-afdd-f757-37b9-7decd55bb4e4', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.10', 'CABEAMENTO SDAI - PANORAMICO', 'SV', 1, 1820.1657, 'PANORÂMICO', 804.3429, 1015.8228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3d2b2638-3787-9db9-0d50-ea6398b7d83f', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.11', 'CABEAMENTO SDAI - PAV TIPO ( 1° AO 36 )', 'SV', 36, 364.4914, 'TIPO', 214.4914, 150.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('10829a83-0d36-5a5b-789b-085ee5cd3677', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.12', 'CABEAMENTO  SDAI - PAV COBERTURA', 'SV', 1, 606.7219, 'COBERTURA', 268.1143, 338.6076);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b75f5549-133e-e176-7d4a-4dbd5ecbe980', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.13', 'CABEAMENTO SDAI - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 1820.1657, 'ROOFTOP', 804.3429, 1015.8228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0ec5695e-e142-9380-86e0-63d483854ba0', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.14', 'CABEAMENTO SDAI - PAV CASA DE MAQUINAS', 'SV', 1, 1213.4438, 'CASA DE MÁQ.', 536.2286, 677.2152);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('253d665c-673f-ccda-cc7c-df83275df171', '0009349d-287b-0cfc-2dad-447b348dfd35', '16.2.15', 'CABEAMENTO SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )', 'SV', 48, 139.0404, 'PAVIMENTOS', 61.4429, 77.5976);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('bd690acb-27f0-54a4-5b9d-d3c34e067a98', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.1', 'EQUIPAMENTOS SDAI - SUBSOLO 04', 'SV', 1, 16532.9296, 'SS4', 13270.2840, 3262.6456);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f1944ec3-a3dc-b675-d202-84fb8872952c', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.2', 'EQUIPAMENTOS SDAI - SUBSOLO 03', 'SV', 1, 12399.6972, 'SS3', 9952.7130, 2446.9842);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('5de4bd8f-290f-d540-3690-20ca4dfff537', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.3', 'EQUIPAMENTOS SDAI - SUBSOLO 02', 'SV', 1, 12399.6972, 'SS2', 9952.7130, 2446.9842);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d237ba35-02f5-d2c9-81d3-1b4b32fdc587', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.4', 'EQUIPAMENTOS SDAI - SUBSOLO 01', 'SV', 1, 12399.6972, 'SS1', 9952.7130, 2446.9842);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('571a3b63-2e8c-c248-8c2c-b7759253cd63', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.5', 'EQUIPAMENTOS SDAI - TERREO', 'SV', 1, 20666.1620, 'TÉRREO', 16587.8550, 4078.3070);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('53e9bf21-7556-dbff-8eba-475307772478', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.6', 'EQUIPAMENTOS SDAI - SOBRESOLO 01', 'SV', 1, 16532.9296, 'G1', 13270.2840, 3262.6456);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c8f7ace9-c904-7785-ab93-436e08376e07', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.7', 'EQUIPAMENTOS SDAI - SOBRESOLO 02', 'SV', 1, 6199.8486, 'G2', 4976.3565, 1223.4921);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c202c42a-ef71-3652-9e33-56311994c70f', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.8', 'EQUIPAMENTOS SDAI - SOBRESOLO 03', 'SV', 1, 6199.8486, 'G3', 4976.3565, 1223.4921);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6aa2b917-ad16-c5eb-3454-b3a2880e1715', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.9', 'EQUIPAMENTOS SDAI - LAZER', 'SV', 1, 6199.8486, 'LAZER', 4976.3565, 1223.4921);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d2362732-afdd-f757-37b9-7decd55bb4e4', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.10', 'EQUIPAMENTOS SDAI - PANORAMICO', 'SV', 1, 6199.8486, 'PANORÂMICO', 4976.3565, 1223.4921);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3d2b2638-3787-9db9-0d50-ea6398b7d83f', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.11', 'EQUIPAMENTOS SDAI - PAV TIPO ( 1° AO 36 )', 'SV', 36, 2066.6162, 'TIPO', 1658.7855, 407.8307);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('10829a83-0d36-5a5b-789b-085ee5cd3677', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.12', 'EQUIPAMENTOS  SDAI - PAV COBERTURA', 'SV', 1, 4133.2324, 'COBERTURA', 3317.5710, 815.6614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('b75f5549-133e-e176-7d4a-4dbd5ecbe980', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.13', 'EQUIPAMENTOS SDAI - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 8266.4648, 'ROOFTOP', 6635.1420, 1631.3228);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('0ec5695e-e142-9380-86e0-63d483854ba0', '6be41991-3697-f581-1baa-fad46fa0e2fc', '16.2.14', 'EQUIPAMENTOS SDAI - PAV CASA DE MAQUINAS', 'SV', 1, 4133.2324, 'CASA DE MÁQ.', 3317.5710, 815.6614);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('732819b0-c424-b059-c04b-9788ff50961e', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.1', 'TUBOS E CONEXÕES - GÁS - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )', 'SV', 48, 1160.8898, 'PAVIMENTOS', 822.7952, 338.0947);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('21b8addf-352a-0d61-61b6-2f76f364eced', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.2', 'TUBOS E CONEXÕES - GÁS - TERREO', 'SV', 1, 31967.0240, 'TÉRREO', 16850.8448, 15116.1792);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('edf5df6f-a911-46e8-c17d-4e5a3e6c629b', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.3', 'TUBOS E CONEXÕES - GÁS - LAZER', 'SV', 1, 6992.7865, 'LAZER', 3686.1223, 3306.6642);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2ec45b99-d45a-0385-00da-e0b398032cec', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.4', 'TUBOS E CONEXÕES - GÁS - PANORAMICO', 'SV', 1, 3995.8780, 'PANORÂMICO', 2106.3556, 1889.5224);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('22cf304d-4bbe-0439-deed-c2ced11f4b0e', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.5', 'TUBOS E CONEXÕES - GÁS - PAV TIPO ( 1° AO 36 )', 'SV', 36, 1497.9390, 'TIPO', 1053.1778, 444.7612);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('9299b165-daef-b837-33d0-49ed96dcf19c', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.6', 'TUBOS E CONEXÕES  - GÁS - PAV COBERTURA', 'SV', 1, 6491.7560, 'COBERTURA', 4212.7112, 2279.0448);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('2022c314-3ca4-51a5-5d17-1d85b8f5c1bd', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.7', 'TUBOS E CONEXÕES - GÁS - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 1997.9390, 'ROOFTOP', 1053.1778, 944.7612);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('1acdddd3-dc32-a056-0931-9d9bf33ea0ac', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.1', 'EQUIPAMENTOS GÁS - LAZER', 'SV', 1, 2893.4590, 'LAZER', 2256.1770, 637.2820);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('075698b8-acaf-b1c6-a403-7971af12e157', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.2', 'EQUIPAMENTOS GÁS - PANORAMICO', 'SV', 1, 2893.4590, 'PANORÂMICO', 2256.1770, 637.2820);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('52c7c1d7-97bb-fec2-06e6-d3cd6f2add3b', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.3', 'EQUIPAMENTOS GÁS - PAV TIPO ( 1° AO 36 )', 'SV', 36, 2266.8238, 'TIPO', 1920.2213, 346.6025);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6a43a83e-555f-68a2-7ddb-2ac60c1883b3', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.4', 'EQUIPAMENTOS  GÁS - PAV COBERTURA', 'SV', 1, 4186.9180, 'COBERTURA', 3512.3540, 674.5640);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('3fae7e70-d210-4206-c788-d5931919cd57', '273aabfa-a3c1-f4a7-8bb9-eb605307b7af', '17.1.5', 'EQUIPAMENTOS GÁS - PAV ROOFTOP + MEZANINO ROOFTOP', 'SV', 1, 2893.4590, 'ROOFTOP', 2256.1770, 637.2820);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d8d3bb41-c5cc-e7b8-a123-b45073beec9b', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.1', 'ATERRAMENTO  - SPDA -  SUBSOLO 4', 'SV', 1, 19753.3665, 'SS4', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('267487fa-d3b3-e9ea-ed3c-85791e4a56ad', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.2', 'ANEL INTERMEDIARIO  - SPDA -  LAZER', 'SV', 1, 31041.0045, 'LAZER', 18290.2016, 12750.8029);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('11312006-3fe4-770c-b64c-8417d7b6fb91', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.3', 'ANEL INTERMEDIARIO  - SPDA -  2° PAV', 'SV', 1, 19753.3665, '2º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('498b68bd-49b7-4d19-03f7-f58c3432eca9', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.4', 'ANEL INTERMEDIARIO  - SPDA -  6° PAV', 'SV', 1, 19753.3665, '6º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('822f9c01-bbfe-3f1c-ecea-b55c6f8b5c63', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.5', 'ANEL INTERMEDIARIO  - SPDA -  10° PAV', 'SV', 1, 19753.3665, '10º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c7ec6279-7625-1074-9f8d-2ac7d53fb700', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.6', 'ANEL INTERMEDIARIO  - SPDA -  14° PAV', 'SV', 1, 19753.3665, '14º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('c4b5a312-6dc4-1807-9a6b-6a1d5e4879a7', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.7', 'ANEL INTERMEDIARIO  - SPDA -  18° PAV', 'SV', 1, 19753.3665, '18º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('f65d6b27-6aa1-47c2-7174-17149d440eb1', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.8', 'ANEL INTERMEDIARIO  - SPDA -  22° PAV', 'SV', 1, 19753.3665, '22º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('a00a611b-0491-05b0-9fb9-2bb5efd37f45', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.9', 'ANEL INTERMEDIARIO  - SPDA -  26° PAV', 'SV', 1, 19753.3665, '26º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('80a66c70-1111-fb49-bc27-a766ce27a6d0', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.10', 'ANEL INTERMEDIARIO  - SPDA -  30° PAV', 'SV', 1, 19753.3665, '30º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('7c68f149-160a-5295-21c2-627a1eb13126', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.11', 'ANEL INTERMEDIARIO  - SPDA -  34° PAV', 'SV', 1, 19753.3665, '34º TIPO', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('6c399a73-5a61-cc9f-5cc5-71da98179e81', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.12', 'ANEL INTERMEDIARIO  - SPDA -  COBERTURA', 'SV', 1, 19753.3665, 'COBERTURA', 11639.2192, 8114.1473);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('32acdfd2-6d86-3966-bbe7-afd140d017b0', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.13', 'ANEL COBERTA - SPDA -  HELIPONTO', 'SV', 1, 33862.9140, 'HELIPONTO', 19952.9472, 13909.9668);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('451abec6-ad9f-610d-ba06-f1f9e67586da', '227ee554-792f-c9d2-4283-aff7448c4eb7', '18.1.14', 'SUBIDAS VERTICAIS ( DIVIDIDA POR VÃOS )', 'SV', 48, 1119.4565, 'PAVIMENTOS', 527.6502, 591.8062);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('da866f02-fc19-a1ef-c99a-391bc906aa30', '8b6ab969-5fb9-4e98-aa3d-31489278657c', '19.1.1', 'ADMINISTRAÇÃO OBRA ( MÊS )', 'SV', 17, 38000.0000, 'TORRE', 38000.0000, 0.0000);
INSERT INTO detalhamentos (id, tarefa_id, codigo, descricao, unidade, quantidade_contratada, valor_unitario, local, valor_material_unit, valor_servico_unit) VALUES
  ('d0c35873-42c8-6693-785a-9431a87efe00', '8b6ab969-5fb9-4e98-aa3d-31489278657c', '19.1.2', 'FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS', 'SV', 1, 220000.0000, 'TORRE', 220000.0000, 0.0000);

-- Insert planejamento_fisico (20 months × 18 grupos)
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-05-01', 8.2248);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-06-01', 1.3786);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-07-01', 1.3786);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-08-01', 76.5204);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-09-01', 8.1109);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-10-01', 4.3868);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-05-01', 7.3212);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-08-01', 75.2500);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-09-01', 17.4288);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-05-01', 2.8371);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-06-01', 4.6562);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-07-01', 14.5153);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-08-01', 12.8690);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-09-01', 5.6784);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-10-01', 5.8592);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-11-01', 4.4698);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-12-01', 3.8424);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-01-01', 3.8424);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-02-01', 3.7219);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-03-01', 3.7219);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-04-01', 3.7219);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-05-01', 3.8828);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-06-01', 5.2516);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-07-01', 11.2556);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-08-01', 9.8632);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-05-01', 8.3232);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-06-01', 10.2570);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-07-01', 11.6695);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-08-01', 11.5054);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-09-01', 9.6593);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-10-01', 6.6135);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-11-01', 3.6407);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-12-01', 7.0153);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-01-01', 2.7933);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-02-01', 2.5916);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-03-01', 2.5916);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-04-01', 2.5916);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-05-01', 3.8636);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-06-01', 5.0637);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-07-01', 4.2166);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-08-01', 4.8212);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-09-01', 2.7826);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2026-08-01', 10.0000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2026-09-01', 12.3000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2026-10-01', 9.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2026-11-01', 14.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2026-12-01', 4.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-01-01', 10.2000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-02-01', 8.1000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-03-01', 8.1000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-04-01', 1.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-05-01', 1.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-06-01', 1.8000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-07-01', 3.1500);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-08-01', 6.1500);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('0744406d-596c-dcdf-964b-d9be3b19b3b3', '2027-09-01', 7.2000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-07-01', 2.4083);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-08-01', 6.9905);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-09-01', 49.1158);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-10-01', 7.1032);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-11-01', 8.5919);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-12-01', 5.3457);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-01-01', 5.8780);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-02-01', 2.4083);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-03-01', 2.4083);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-04-01', 2.4083);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-05-01', 0.6506);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-06-01', 3.6709);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2027-07-01', 3.0203);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-05-01', 3.0000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-06-01', 7.0000);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-07-01', 12.1994);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-08-01', 16.1117);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-09-01', 9.8601);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-10-01', 4.9123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-11-01', 6.7722);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-12-01', 4.4123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-01-01', 4.4123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-02-01', 4.4123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-03-01', 4.4123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-04-01', 3.8607);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-05-01', 3.8607);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-06-01', 5.1808);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-07-01', 5.1808);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-08-01', 4.4123);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-06-01', 6.6676);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-07-01', 9.3156);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-08-01', 9.3156);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-09-01', 7.8809);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-10-01', 9.3156);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-11-01', 9.3156);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-12-01', 10.1308);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-01-01', 7.7397);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-02-01', 5.9681);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-03-01', 5.9681);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-04-01', 5.9681);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-05-01', 5.4899);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-06-01', 6.9245);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-05-01', 2.9400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-06-01', 6.9400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-07-01', 7.6400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-08-01', 9.1400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-09-01', 8.8900);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-10-01', 7.8900);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-11-01', 7.3900);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-12-01', 7.3900);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-01-01', 8.6400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-02-01', 6.1400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-03-01', 6.1400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-04-01', 6.1400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-05-01', 6.9400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-06-01', 6.9400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-07-01', 0.8400);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-05-01', 3.3059);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-06-01', 5.8622);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-07-01', 5.7688);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-08-01', 6.9839);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-09-01', 7.7004);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-10-01', 7.5528);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-11-01', 6.5870);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-12-01', 6.0480);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-01-01', 6.5754);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-02-01', 6.5740);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-03-01', 6.5813);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-04-01', 5.5557);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-05-01', 13.1175);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-06-01', 9.2662);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-07-01', 2.5209);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2026-10-01', 10.1463);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2026-11-01', 10.1463);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2026-12-01', 10.1463);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-01-01', 10.1463);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-03-01', 3.1435);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-04-01', 3.1435);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-06-01', 26.5640);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-07-01', 26.5640);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-06-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-07-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-08-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-09-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-10-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-11-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-12-01', 7.7172);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-01-01', 9.4632);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-02-01', 9.4632);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-03-01', 9.4632);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-04-01', 1.7461);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-07-01', 7.7082);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-08-01', 8.1358);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-05-01', 3.6722);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-06-01', 9.1222);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-07-01', 9.5979);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-08-01', 11.2641);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-09-01', 7.9735);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-10-01', 9.4005);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-11-01', 12.2929);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-12-01', 5.0669);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-01-01', 2.6536);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-02-01', 2.4941);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-03-01', 2.4941);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-04-01', 2.4941);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-05-01', 2.4941);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-06-01', 4.1855);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-07-01', 9.1911);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-08-01', 5.6031);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('4f5558fa-2077-3e92-0d34-02dea3e4cac2', '2027-08-01', 70.1143);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('4f5558fa-2077-3e92-0d34-02dea3e4cac2', '2027-09-01', 29.8857);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-05-01', 2.3869);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-06-01', 5.8168);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-07-01', 6.2263);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-08-01', 5.6436);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-09-01', 4.3636);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-10-01', 3.1631);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-11-01', 2.3404);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-12-01', 5.2063);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-01-01', 1.2918);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-02-01', 1.2752);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-03-01', 1.2587);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-04-01', 4.8548);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-05-01', 5.1523);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-06-01', 20.3292);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-07-01', 22.1593);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-08-01', 7.4572);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-09-01', 0.7206);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-10-01', 0.3440);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-05-01', 7.5202);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-06-01', 16.2155);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-07-01', 5.9641);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-08-01', 6.4372);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-09-01', 5.3623);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-10-01', 5.3623);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-11-01', 5.3623);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-12-01', 5.3623);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-01-01', 4.2721);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-02-01', 4.2721);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-03-01', 4.2721);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-04-01', 4.2721);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-05-01', 5.1575);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-06-01', 6.7531);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-07-01', 7.5380);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-08-01', 5.8771);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-03-01', 16.1205);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-04-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-05-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-06-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-07-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-08-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-09-01', 0.9997);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-10-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-11-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-12-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-01-01', 0.9997);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-02-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-03-01', 6.8800);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-04-01', 0.9997);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-05-01', 0.9997);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-06-01', 11.0802);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-05-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-06-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-07-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-08-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-09-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-10-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-11-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-12-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-01-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-02-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-03-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-04-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-05-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-06-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-07-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-08-01', 5.8824);
INSERT INTO planejamento_fisico (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-09-01', 5.8824);

-- Insert planejamento_fat_direto (20 months × 18 grupos)
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-04-01', 8.2248);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-05-01', 2.7571);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-07-01', 76.5204);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c470908c-37ad-4bbd-b15e-c30420bf3e04', '2026-08-01', 12.4977);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-04-01', 7.3212);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-07-01', 75.2500);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('0f6c06c1-da38-7b0e-a7dc-32f8d1ae609e', '2026-08-01', 17.4288);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-04-01', 13.9936);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-05-01', 22.7327);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-06-01', 19.5337);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2026-11-01', 26.6644);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-04-01', 0.9924);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('da154b43-68e8-771a-ac55-8e496bddc64a', '2027-05-01', 16.0831);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-04-01', 51.1528);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-05-01', 10.0856);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-07-01', 8.4261);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-11-01', 10.0856);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2026-12-01', 8.4261);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-04-01', 8.1341);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('2341f9a5-4016-bee6-1332-474318c39d19', '2027-06-01', 3.6896);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-06-01', 12.0414);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-07-01', 68.5754);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('00061229-7986-699d-88d2-d040dbd492d1', '2026-11-01', 19.3832);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-04-01', 42.2065);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2026-07-01', 27.5767);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-02-01', 27.5767);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('3c43cadf-2161-5334-9fd5-293b09bb06fd', '2027-05-01', 2.6400);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-05-01', 55.8087);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-11-01', 3.5433);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2026-12-01', 37.3006);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('428b735e-3a63-52e2-2dc9-cbd93e05ea8f', '2027-04-01', 3.3475);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-04-01', 41.0000);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-06-01', 14.0000);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2026-12-01', 41.0000);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('369fd87b-b762-1179-ab06-37b2a1966cc8', '2027-04-01', 4.0000);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-04-01', 30.2993);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-05-01', 7.2292);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-06-01', 18.3167);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-11-01', 8.2236);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2026-12-01', 30.2993);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('488b4651-16cc-adbe-2662-edadc0f036b7', '2027-04-01', 5.6319);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2026-09-01', 40.5851);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('335add86-a820-19fb-f9ad-e7aa6a3e9a95', '2027-02-01', 59.4149);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-05-01', 54.0202);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2026-12-01', 30.1358);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('578cb596-6c31-addb-191b-061c9b01848d', '2027-06-01', 15.8440);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-04-01', 9.2883);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-05-01', 3.1913);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-06-01', 7.5136);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-07-01', 7.9893);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-08-01', 9.7451);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-09-01', 6.4196);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-10-01', 7.8466);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-11-01', 20.3684);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2026-12-01', 3.8540);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-01-01', 1.4757);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-02-01', 1.4757);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-03-01', 1.4757);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-04-01', 1.4757);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-05-01', 3.1382);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-06-01', 3.1041);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-07-01', 7.3414);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('9870c9b4-bb78-7ea5-b5aa-3728d5ca37c7', '2027-08-01', 4.2974);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('4f5558fa-2077-3e92-0d34-02dea3e4cac2', '2027-07-01', 1.0000);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-04-01', 22.6753);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-05-01', 8.1645);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-07-01', 6.8716);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2026-08-01', 3.4404);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-03-01', 51.3095);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-04-01', 5.1604);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('dff1c618-976d-f1e1-0a93-11ff5cf2d5c1', '2027-06-01', 2.3783);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-04-01', 38.2600);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-05-01', 23.4840);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2026-12-01', 21.4520);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-04-01', 13.4820);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('c89fdfa2-0d2e-df13-9015-d2749e0f5ca1', '2027-05-01', 3.3219);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-04-01', 54.1197);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2026-09-01', 17.6409);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('e9b0a1d0-c6db-c953-19bf-4d5a5827578b', '2027-01-01', 28.2394);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-05-01', 4.3880);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-06-01', 4.3880);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-07-01', 4.3880);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-08-01', 5.9122);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-09-01', 5.9122);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-10-01', 5.9122);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-11-01', 5.9122);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2026-12-01', 6.1663);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-01-01', 6.1663);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-02-01', 6.1663);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-03-01', 6.1663);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-04-01', 6.1663);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-05-01', 6.9284);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-06-01', 6.9284);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-07-01', 6.9284);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-08-01', 6.9284);
INSERT INTO planejamento_fat_direto (grupo_macro_id, mes, pct_planejado) VALUES ('a1877456-1a60-264d-684b-0c11fd3f471c', '2027-09-01', 4.6420);
