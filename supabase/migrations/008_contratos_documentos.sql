-- ================================================================
-- 008: Tabela de documentos do contrato + bucket de storage
-- ================================================================

-- Tabela principal de documentos
CREATE TABLE IF NOT EXISTS contratos_documentos (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contrato_id     UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  nome_original   VARCHAR(500) NOT NULL,
  nome_storage    VARCHAR(500) NOT NULL,
  storage_path    TEXT NOT NULL,
  url             TEXT,
  tipo            VARCHAR(50) NOT NULL DEFAULT 'outro' CHECK (tipo IN (
    'contrato_assinado', 'aditivo', 'nota_fiscal', 'boleto',
    'relatorio', 'projeto', 'ata', 'outro'
  )),
  tamanho_bytes   INTEGER,
  mime_type       VARCHAR(100),
  descricao       TEXT,
  uploaded_por    VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documentos_contrato ON contratos_documentos(contrato_id);

-- RLS policies
ALTER TABLE contratos_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados podem ver documentos"
  ON contratos_documentos FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem inserir documentos"
  ON contratos_documentos FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Autenticados podem excluir documentos"
  ON contratos_documentos FOR DELETE
  USING (auth.role() = 'authenticated');

-- ================================================================
-- Criar bucket de storage para documentos dos contratos
-- Execute no SQL Editor do Supabase:
-- ================================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('contratos-documentos', 'contratos-documentos', false)
-- ON CONFLICT DO NOTHING;

-- CREATE POLICY "Autenticados fazem upload" ON storage.objects
--   FOR INSERT WITH CHECK (bucket_id = 'contratos-documentos' AND auth.role() = 'authenticated');

-- CREATE POLICY "Autenticados fazem download" ON storage.objects
--   FOR SELECT USING (bucket_id = 'contratos-documentos' AND auth.role() = 'authenticated');

-- CREATE POLICY "Autenticados deletam" ON storage.objects
--   FOR DELETE USING (bucket_id = 'contratos-documentos' AND auth.role() = 'authenticated');
