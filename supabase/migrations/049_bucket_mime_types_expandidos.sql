-- ============================================================
-- 049 — Amplia MIMEs aceitos no bucket faturamento-direto
-- ============================================================
-- Hoje o bucket só aceita 'application/pdf' (definido na migration 013).
-- Mas o app permite NFs em PNG/JPG (foto de NF impressa) e XML (NFe), além
-- de anexos de pedido em PDF/imagem.
--
-- Sem essa atualização, qualquer upload não-PDF é rejeitado pelo bucket
-- com 'mime type not allowed' antes mesmo de chegar nas validações da app.
--
-- Idempotente: UPDATE só altera; SELECT confirma o estado atual.
-- ============================================================

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/xml',
        'text/xml',
        'application/octet-stream'
       ]::text[],
       file_size_limit = 52428800  -- 50 MB (mantém o limite atual)
 WHERE id = 'faturamento-direto';

-- Sanity: log o estado pós-update
DO $$
DECLARE
  mimes text[];
BEGIN
  SELECT allowed_mime_types INTO mimes
    FROM storage.buckets WHERE id = 'faturamento-direto';
  RAISE NOTICE 'Bucket faturamento-direto allowed_mime_types: %', mimes;
END $$;
