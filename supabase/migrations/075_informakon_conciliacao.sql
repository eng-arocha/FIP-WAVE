-- ============================================================================
-- 075 — Importação e conciliação do relatório do Informakon
--
-- O Informakon (ERP da FIP) é a fonte de verdade do desconto de material que
-- entra na medição de serviço da Wave. Até aqui a conferência era manual e só
-- aparecia depois da NF emitida — foi assim que a medição 04/2026 fechou com
-- divergência.
--
-- Estas tabelas guardam o relatório "Controle FIP INFORMAKON" tal como veio,
-- sem interpretar: cada importação é um retrato datado. A conciliação contra
-- notas_fiscais_fat_direto é feita em consulta, nunca por sobrescrita — o dado
-- do ERP e o dado do FIP-WAVE convivem e a divergência é o produto.
--
-- Abas do relatório -> tabelas:
--   "faturamento direto global" -> informakon_nf_linhas
--   "med 1".."med N"            -> informakon_medicao_descontos
--   "medições serviço"          -> informakon_medicoes_servico
-- ============================================================================

CREATE TABLE IF NOT EXISTS informakon_importacoes (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_id       UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  arquivo_nome      TEXT NOT NULL,
  -- Data a que o retrato se refere (extraída do nome do arquivo quando possível,
  -- senão a data da importação).
  referencia        DATE NOT NULL DEFAULT CURRENT_DATE,
  importado_por_id  UUID REFERENCES perfis(id),
  importado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qtd_linhas        INTEGER NOT NULL DEFAULT 0,
  total_nf          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_descontado  NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_a_descontar NUMERIC(15,2) NOT NULL DEFAULT 0,
  observacoes       TEXT
);

CREATE INDEX IF NOT EXISTS idx_informakon_imp_contrato
  ON informakon_importacoes (contrato_id, referencia DESC);

-- ----------------------------------------------------------------------------
-- Aba "faturamento direto global": uma linha por entrada de NF.
-- A chave real do Informakon é `entrada` (ex.: '155645/001') — identifica a
-- nota E o item do pedido. O número da nota sozinho é ambíguo: a mesma NF pode
-- aparecer em dois macro itens.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informakon_nf_linhas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  importacao_id       UUID NOT NULL REFERENCES informakon_importacoes(id) ON DELETE CASCADE,
  entrada             TEXT NOT NULL,
  documento           TEXT,          -- 'NF-e 115581'
  numero_nf           TEXT,          -- '115581' (só dígitos, para o de-para)
  tipo_doc            TEXT,          -- 'NF-e' | 'NFS-e'
  pedido              TEXT,
  item_pedido         TEXT,
  macro_item          TEXT,          -- texto da coluna Especificação
  grupo_codigo        TEXT,          -- de-para resolvido: '1'..'18'
  detalhamento_codigo TEXT,          -- '19.1.1' / '19.1.2' quando o macro item é do grupo 19
  valor_descontado    NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_a_descontar   NUMERIC(15,2) NOT NULL DEFAULT 0,
  -- Enriquecimento a partir da aba "NFS WAVE GLOBAL" (todos os lançamentos da
  -- obra). O relatório de faturamento direto não traz o fornecedor; ele é
  -- resolvido cruzando tipo + número do documento. Ver metodo_fornecedor.
  fornecedor_codigo   TEXT,
  fornecedor_nome     TEXT,
  metodo_fornecedor   TEXT           -- 'nome_unico' | 'valor_linha' | 'valor_agregado' | 'ambiguo'
);

CREATE INDEX IF NOT EXISTS idx_informakon_nf_imp     ON informakon_nf_linhas (importacao_id);
CREATE INDEX IF NOT EXISTS idx_informakon_nf_numero  ON informakon_nf_linhas (numero_nf);
CREATE INDEX IF NOT EXISTS idx_informakon_nf_grupo   ON informakon_nf_linhas (importacao_id, grupo_codigo);

-- ----------------------------------------------------------------------------
-- Abas "med N": o que foi efetivamente descontado em cada medição.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informakon_medicao_descontos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  importacao_id       UUID NOT NULL REFERENCES informakon_importacoes(id) ON DELETE CASCADE,
  medicao_numero      INTEGER NOT NULL,
  entrada             TEXT,
  documento           TEXT,
  numero_nf           TEXT,
  macro_item          TEXT,
  grupo_codigo        TEXT,
  detalhamento_codigo TEXT,
  valor_a_descontar   NUMERIC(15,2) NOT NULL DEFAULT 0,
  percentual_desc     NUMERIC(9,4)  NOT NULL DEFAULT 0,
  valor_descontado    NUMERIC(15,2) NOT NULL DEFAULT 0,
  fornecedor_codigo   TEXT,
  fornecedor_nome     TEXT
);

CREATE INDEX IF NOT EXISTS idx_informakon_md_imp
  ON informakon_medicao_descontos (importacao_id, medicao_numero);

-- ----------------------------------------------------------------------------
-- Aba "medições serviço": as medições da Wave como o Informakon as fechou.
-- É contra esta tabela que o rodapé da medição do FIP-WAVE deve bater.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS informakon_medicoes_servico (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  importacao_id      UUID NOT NULL REFERENCES informakon_importacoes(id) ON DELETE CASCADE,
  numero_informakon  INTEGER,        -- 3378
  rotulo             TEXT,           -- 'MED 04'
  medicao_numero     INTEGER,        -- 4 (extraído do rótulo)
  data_medicao       DATE,
  valor_contratual   NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_material     NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_liquido      NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_reajuste     NUMERIC(15,2) NOT NULL DEFAULT 0,
  descontos_diversos NUMERIC(15,2) NOT NULL DEFAULT 0,
  impostos_retidos   NUMERIC(15,2) NOT NULL DEFAULT 0,
  retencao           NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_a_pagar      NUMERIC(15,2) NOT NULL DEFAULT 0,
  tipo_documento     TEXT,
  numero_documento   TEXT
);

CREATE INDEX IF NOT EXISTS idx_informakon_ms_imp
  ON informakon_medicoes_servico (importacao_id, medicao_numero);

-- ----------------------------------------------------------------------------
-- RLS: leitura para autenticados; escrita só pelo service_role (admin client).
-- ----------------------------------------------------------------------------
ALTER TABLE informakon_importacoes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE informakon_nf_linhas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE informakon_medicao_descontos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE informakon_medicoes_servico   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS informakon_importacoes_select ON informakon_importacoes;
CREATE POLICY informakon_importacoes_select ON informakon_importacoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS informakon_nf_linhas_select ON informakon_nf_linhas;
CREATE POLICY informakon_nf_linhas_select ON informakon_nf_linhas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS informakon_medicao_descontos_select ON informakon_medicao_descontos;
CREATE POLICY informakon_medicao_descontos_select ON informakon_medicao_descontos
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS informakon_medicoes_servico_select ON informakon_medicoes_servico;
CREATE POLICY informakon_medicoes_servico_select ON informakon_medicoes_servico
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE informakon_importacoes IS
  'Retrato datado do relatório de faturamento direto do Informakon (ERP da FIP). Cada importação preserva o arquivo como veio; a conciliação com notas_fiscais_fat_direto é feita em consulta, nunca por sobrescrita.';
COMMENT ON TABLE informakon_nf_linhas IS
  'Aba "faturamento direto global": uma linha por entrada de NF. A chave do Informakon é `entrada` (NF + item do pedido); numero_nf sozinho pode repetir entre macro itens.';
COMMENT ON TABLE informakon_medicao_descontos IS
  'Abas "med N": quais notas o Informakon descontou em cada medição, com o percentual aplicado.';
COMMENT ON TABLE informakon_medicoes_servico IS
  'Aba "medições serviço": as medições da Wave como o Informakon as fechou. O rodapé da medição do FIP-WAVE deve bater com valor_a_pagar.';
