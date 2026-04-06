-- Migration 013: Documentos de Faturamento Direto (PDFs)
-- Adiciona colunas para rastrear Pedido PDF e Nota Fiscal

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS pedido_pdf_url    TEXT,
  ADD COLUMN IF NOT EXISTS pedido_pdf_nome   TEXT,
  ADD COLUMN IF NOT EXISTS nf_numero         TEXT,
  ADD COLUMN IF NOT EXISTS nf_data           DATE,
  ADD COLUMN IF NOT EXISTS nf_pdf_url        TEXT,
  ADD COLUMN IF NOT EXISTS status_documento  TEXT NOT NULL DEFAULT 'pendente_nf'
    CHECK (status_documento IN ('pendente_nf', 'nf_recebida', 'pago'));

-- Criar bucket para PDFs de faturamento direto
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'faturamento-direto',
  'faturamento-direto',
  true,
  52428800,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: usuários autenticados podem fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'fat_direto_upload'
  ) THEN
    CREATE POLICY "fat_direto_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'faturamento-direto');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'fat_direto_select'
  ) THEN
    CREATE POLICY "fat_direto_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'faturamento-direto');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'fat_direto_update'
  ) THEN
    CREATE POLICY "fat_direto_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'faturamento-direto');
  END IF;
END $$;
