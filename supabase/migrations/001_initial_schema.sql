-- ============================================================
-- FIP-WAVE: Sistema de Controle de Medições
-- Schema inicial do banco de dados
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- EMPRESAS
-- ============================================================
CREATE TABLE empresas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('contratante', 'contratado', 'ambos')),
  email_contato VARCHAR(255),
  telefone VARCHAR(20),
  endereco TEXT,
  responsavel VARCHAR(255),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CONTRATOS
-- ============================================================
CREATE TABLE contratos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero VARCHAR(50) NOT NULL UNIQUE,
  descricao VARCHAR(500) NOT NULL,
  escopo TEXT,
  contratante_id UUID NOT NULL REFERENCES empresas(id),
  contratado_id UUID NOT NULL REFERENCES empresas(id),
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('global', 'preco_unitario', 'percentual_servico_material')),
  -- Valores base
  valor_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  valor_servicos DECIMAL(15,2) DEFAULT 0,
  valor_material_direto DECIMAL(15,2) DEFAULT 0,
  -- Datas
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  -- Status
  status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('rascunho', 'ativo', 'suspenso', 'encerrado', 'cancelado')),
  -- Dados adicionais
  objeto TEXT,
  local_obra VARCHAR(255),
  fiscal_obra VARCHAR(255),
  email_fiscal VARCHAR(255),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ADITIVOS
-- ============================================================
CREATE TABLE aditivos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('valor', 'prazo', 'escopo', 'misto')),
  descricao TEXT NOT NULL,
  -- Valor
  valor_anterior DECIMAL(15,2),
  valor_adicional DECIMAL(15,2),
  valor_novo DECIMAL(15,2),
  -- Prazo
  data_fim_anterior DATE,
  data_fim_nova DATE,
  -- Status
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  aprovado_por VARCHAR(255),
  aprovado_em TIMESTAMPTZ,
  documento_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contrato_id, numero)
);

-- ============================================================
-- ESTRUTURA HIERÁRQUICA DO CONTRATO
-- Nível 1: Grupos Macro
-- ============================================================
CREATE TABLE grupos_macro (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  codigo VARCHAR(20) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  tipo_medicao VARCHAR(30) NOT NULL CHECK (tipo_medicao IN ('servico', 'faturamento_direto', 'misto')),
  valor_contratado DECIMAL(15,2) NOT NULL DEFAULT 0,
  percentual_contrato DECIMAL(5,2),
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contrato_id, codigo)
);

-- Nível 2: Tarefas
CREATE TABLE tarefas (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  grupo_macro_id UUID NOT NULL REFERENCES grupos_macro(id) ON DELETE CASCADE,
  codigo VARCHAR(30) NOT NULL,
  nome VARCHAR(255) NOT NULL,
  unidade VARCHAR(20),
  quantidade_contratada DECIMAL(15,3),
  valor_unitario DECIMAL(15,4),
  valor_total DECIMAL(15,2) NOT NULL DEFAULT 0,
  percentual_grupo DECIMAL(5,2),
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nível 3: Detalhamentos
CREATE TABLE detalhamentos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES tarefas(id) ON DELETE CASCADE,
  codigo VARCHAR(40) NOT NULL,
  descricao VARCHAR(500) NOT NULL,
  unidade VARCHAR(20) NOT NULL,
  quantidade_contratada DECIMAL(15,3) NOT NULL,
  valor_unitario DECIMAL(15,4) NOT NULL,
  valor_total DECIMAL(15,2) GENERATED ALWAYS AS (quantidade_contratada * valor_unitario) STORED,
  percentual_tarefa DECIMAL(5,2),
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MEDIÇÕES
-- ============================================================
CREATE TABLE medicoes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  periodo_referencia VARCHAR(7) NOT NULL, -- YYYY-MM
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('servico', 'faturamento_direto', 'misto')),
  status VARCHAR(20) DEFAULT 'rascunho' CHECK (status IN (
    'rascunho', 'submetido', 'em_analise', 'aprovado', 'rejeitado', 'cancelado'
  )),
  valor_total DECIMAL(15,2) DEFAULT 0,
  data_submissao TIMESTAMPTZ,
  data_aprovacao TIMESTAMPTZ,
  solicitante_nome VARCHAR(255) NOT NULL,
  solicitante_email VARCHAR(255) NOT NULL,
  observacoes TEXT,
  motivo_rejeicao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contrato_id, numero)
);

-- Itens da medição (ligados ao detalhamento)
CREATE TABLE medicao_itens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicao_id UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  detalhamento_id UUID NOT NULL REFERENCES detalhamentos(id),
  quantidade_medida DECIMAL(15,3) NOT NULL DEFAULT 0,
  valor_unitario DECIMAL(15,4) NOT NULL DEFAULT 0,
  valor_medido DECIMAL(15,2) GENERATED ALWAYS AS (quantidade_medida * valor_unitario) STORED,
  percentual_medido DECIMAL(5,2),
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(medicao_id, detalhamento_id)
);

-- Anexos da medição
CREATE TABLE medicao_anexos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicao_id UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  nome_original VARCHAR(255) NOT NULL,
  nome_storage VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  tipo_documento VARCHAR(50) NOT NULL CHECK (tipo_documento IN (
    'nota_fiscal', 'boleto', 'relatorio_fotos', 'medicao_assinada', 'outro'
  )),
  tamanho_bytes INTEGER,
  mime_type VARCHAR(100),
  uploaded_por VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTAS FISCAIS (Validação de compras - Faturamento Direto)
-- ============================================================
CREATE TABLE notas_fiscais (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicao_id UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  numero_nf VARCHAR(50) NOT NULL,
  emitente VARCHAR(255) NOT NULL,
  cnpj_emitente VARCHAR(18),
  valor DECIMAL(15,2) NOT NULL,
  data_emissao DATE NOT NULL,
  descricao TEXT,
  url_arquivo TEXT,
  status_validacao VARCHAR(20) DEFAULT 'pendente' CHECK (status_validacao IN ('pendente', 'aprovada', 'rejeitada')),
  validado_por VARCHAR(255),
  validado_em TIMESTAMPTZ,
  observacao_validacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WORKFLOW DE APROVAÇÃO
-- ============================================================
CREATE TABLE aprovacoes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicao_id UUID NOT NULL REFERENCES medicoes(id) ON DELETE CASCADE,
  aprovador_nome VARCHAR(255) NOT NULL,
  aprovador_email VARCHAR(255) NOT NULL,
  acao VARCHAR(20) NOT NULL CHECK (acao IN ('aprovado', 'rejeitado', 'solicitou_ajuste', 'comentou')),
  nivel INTEGER DEFAULT 1,
  comentario TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOG DE NOTIFICAÇÕES POR E-MAIL
-- ============================================================
CREATE TABLE notificacoes_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  medicao_id UUID REFERENCES medicoes(id),
  tipo VARCHAR(50) NOT NULL CHECK (tipo IN (
    'nova_medicao', 'aprovado', 'rejeitado', 'ajuste_solicitado', 'lembrete'
  )),
  destinatario_email VARCHAR(255) NOT NULL,
  destinatario_nome VARCHAR(255),
  assunto VARCHAR(500),
  status_envio VARCHAR(20) DEFAULT 'pendente' CHECK (status_envio IN ('pendente', 'enviado', 'falhou')),
  message_id VARCHAR(255),
  erro_mensagem TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USUARIOS DO SISTEMA
-- ============================================================
CREATE TABLE usuarios (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  empresa_id UUID REFERENCES empresas(id),
  papel VARCHAR(20) NOT NULL DEFAULT 'visualizador' CHECK (papel IN (
    'admin', 'aprovador', 'solicitante', 'visualizador'
  )),
  ativo BOOLEAN DEFAULT true,
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Relação usuário <> contrato (papel específico por contrato)
CREATE TABLE contrato_usuarios (
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  papel VARCHAR(20) NOT NULL CHECK (papel IN ('aprovador', 'solicitante', 'visualizador')),
  PRIMARY KEY (contrato_id, usuario_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_contratos_contratante ON contratos(contratante_id);
CREATE INDEX idx_contratos_contratado ON contratos(contratado_id);
CREATE INDEX idx_grupos_contrato ON grupos_macro(contrato_id);
CREATE INDEX idx_tarefas_grupo ON tarefas(grupo_macro_id);
CREATE INDEX idx_detalhamentos_tarefa ON detalhamentos(tarefa_id);
CREATE INDEX idx_medicoes_contrato ON medicoes(contrato_id);
CREATE INDEX idx_medicoes_status ON medicoes(status);
CREATE INDEX idx_medicao_itens_medicao ON medicao_itens(medicao_id);
CREATE INDEX idx_aprovacoes_medicao ON aprovacoes(medicao_id);
CREATE INDEX idx_notificacoes_medicao ON notificacoes_log(medicao_id);

-- ============================================================
-- VIEWS ÚTEIS
-- ============================================================

-- Resumo financeiro por contrato
CREATE VIEW vw_resumo_contrato AS
SELECT
  c.id AS contrato_id,
  c.numero,
  c.descricao,
  c.valor_total AS valor_contratado,
  c.valor_servicos,
  c.valor_material_direto,
  COALESCE(SUM(m.valor_total) FILTER (WHERE m.status = 'aprovado'), 0) AS valor_medido,
  c.valor_total - COALESCE(SUM(m.valor_total) FILTER (WHERE m.status = 'aprovado'), 0) AS saldo,
  CASE WHEN c.valor_total > 0
    THEN ROUND(COALESCE(SUM(m.valor_total) FILTER (WHERE m.status = 'aprovado'), 0) / c.valor_total * 100, 2)
    ELSE 0
  END AS percentual_medido,
  COUNT(m.id) FILTER (WHERE m.status = 'aprovado') AS qtd_medicoes_aprovadas,
  COUNT(m.id) FILTER (WHERE m.status IN ('submetido', 'em_analise')) AS qtd_medicoes_pendentes
FROM contratos c
LEFT JOIN medicoes m ON m.contrato_id = c.id
GROUP BY c.id;

-- Acumulado por grupo macro
CREATE VIEW vw_medicao_grupo AS
SELECT
  gm.id AS grupo_id,
  gm.contrato_id,
  gm.codigo,
  gm.nome,
  gm.tipo_medicao,
  gm.valor_contratado,
  COALESCE(SUM(mi.valor_medido) FILTER (WHERE med.status = 'aprovado'), 0) AS valor_medido,
  gm.valor_contratado - COALESCE(SUM(mi.valor_medido) FILTER (WHERE med.status = 'aprovado'), 0) AS saldo
FROM grupos_macro gm
LEFT JOIN tarefas t ON t.grupo_macro_id = gm.id
LEFT JOIN detalhamentos d ON d.tarefa_id = t.id
LEFT JOIN medicao_itens mi ON mi.detalhamento_id = d.id
LEFT JOIN medicoes med ON med.id = mi.medicao_id
GROUP BY gm.id;

-- ============================================================
-- SEED DATA - Dados iniciais de exemplo
-- ============================================================

-- Empresas
INSERT INTO empresas (id, nome, cnpj, tipo, email_contato, responsavel) VALUES
  ('11111111-1111-1111-1111-111111111111', 'FIP Engenharia', '00.000.000/0001-00', 'contratado', 'financeiro@fipengenharia.com.br', 'Equipe FIP'),
  ('22222222-2222-2222-2222-222222222222', 'Wave Instalações SPE LTDA', '99.999.999/0001-99', 'contratante', 'medicao@waveinstalacoes.com.br', 'Equipe Wave');

-- Contrato Wave (o contrato em contexto)
INSERT INTO contratos (
  id, numero, descricao, escopo,
  contratante_id, contratado_id,
  tipo, valor_total, valor_servicos, valor_material_direto,
  data_inicio, data_fim, status, local_obra, fiscal_obra
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'WAVE-2025-001',
  'Contrato de Instalações - Empreendimento Wave',
  'Execução completa de instalações elétricas, hidráulicas e de ar-condicionado do empreendimento Wave, conforme ANEXO II e III.',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'percentual_servico_material',
  18000000.00,
  6700000.00,
  11300000.00,
  '2025-01-01',
  '2026-12-31',
  'ativo',
  'São Paulo - SP',
  'Eng. Responsável FIP'
);

-- Grupos Macro do contrato Wave
INSERT INTO grupos_macro (contrato_id, codigo, nome, tipo_medicao, valor_contratado, ordem) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1.0', 'Instalações Elétricas', 'misto', 7200000.00, 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2.0', 'Instalações Hidráulicas', 'misto', 5400000.00, 2),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '3.0', 'Ar-Condicionado e Ventilação', 'misto', 3600000.00, 3),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '4.0', 'Instalações de SPDA e Aterramento', 'servico', 900000.00, 4),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5.0', 'Gestão e Supervisão', 'servico', 900000.00, 5);
