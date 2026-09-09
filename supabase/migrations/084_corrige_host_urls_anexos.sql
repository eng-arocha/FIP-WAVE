-- ============================================================
-- 084 — Corrige o HOST das URLs de anexo gravadas em
--       solicitacoes_fat_direto (placeholder que nunca foi
--       substituido pelo ref real do projeto)
-- ============================================================
-- Contexto: depois da 083 os anexos voltaram a aparecer na tela, mas
-- clicar em "Abrir" dava erro de DNS no navegador:
--     "Nao foi possivel encontrar o endereco IP do servidor de
--      XXXXXXXXXXXX.supabase.co"
--
-- As URLs gravadas apontam para o host literal
-- `https://XXXXXXXXXXXX.supabase.co` — um placeholder de template que
-- entrou no banco durante a religacao manual dos anexos orfaos e nunca
-- foi trocado pelo ref real do projeto. O PATH esta correto: os arquivos
-- existem e respondem 200 quando pedidos no host certo (conferido em
-- pedidos/516c7a7e-.../ — dois PDFs, 13.530 e 185.476 bytes).
--
-- Alcance medido antes da correcao: 112 de 168 solicitacoes, tanto em
-- pedido_anexos quanto em pedido_pdf_url. nf_pdf_url estava limpo.
--
-- Estrategia: reescreve o host de QUALQUER URL que aponte para o bucket
-- `faturamento-direto`, seja o placeholder ou qualquer outro host antigo.
-- O path (tudo depois do marcador) fica intacto — `[^/"]+` para no
-- primeiro `/` ou aspa, entao nao ha como corromper o caminho.
--
-- 100% IDEMPOTENTE: o WHERE so aceita linhas que a substituicao REALMENTE
-- mudaria. Rodar de novo depois de corrigido nao toca em nada.
-- ============================================================

DO $$
DECLARE
  -- Host correto do projeto. Se um dia o projeto Supabase mudar, e a
  -- unica linha desta migration que precisa mudar.
  v_host    TEXT := 'https://ktfoozriunzoeeoqfpns.supabase.co';
  v_padrao  TEXT := 'https?://[^/"]+/storage/v1/object/public/faturamento-direto/';
  v_destino TEXT;
  v_anexos  INTEGER := 0;
  v_pdf     INTEGER := 0;
  v_nf      INTEGER := 0;
BEGIN
  v_destino := v_host || '/storage/v1/object/public/faturamento-direto/';

  -- ── pedido_anexos (JSONB): reescreve o texto inteiro do array ──
  UPDATE public.solicitacoes_fat_direto
     SET pedido_anexos = regexp_replace(pedido_anexos::text, v_padrao, v_destino, 'g')::jsonb
   WHERE pedido_anexos IS NOT NULL
     AND regexp_replace(pedido_anexos::text, v_padrao, v_destino, 'g') IS DISTINCT FROM pedido_anexos::text;
  GET DIAGNOSTICS v_anexos = ROW_COUNT;

  -- ── pedido_pdf_url (TEXT) ──
  UPDATE public.solicitacoes_fat_direto
     SET pedido_pdf_url = regexp_replace(pedido_pdf_url, v_padrao, v_destino, 'g')
   WHERE pedido_pdf_url IS NOT NULL
     AND regexp_replace(pedido_pdf_url, v_padrao, v_destino, 'g') IS DISTINCT FROM pedido_pdf_url;
  GET DIAGNOSTICS v_pdf = ROW_COUNT;

  -- ── nf_pdf_url (TEXT): estava limpo na medicao, mas o mesmo padrao
  --    vale — e no-op se ja estiver certo. ──
  UPDATE public.solicitacoes_fat_direto
     SET nf_pdf_url = regexp_replace(nf_pdf_url, v_padrao, v_destino, 'g')
   WHERE nf_pdf_url IS NOT NULL
     AND regexp_replace(nf_pdf_url, v_padrao, v_destino, 'g') IS DISTINCT FROM nf_pdf_url;
  GET DIAGNOSTICS v_nf = ROW_COUNT;

  RAISE NOTICE '084: pedido_anexos corrigidos em % linha(s)', v_anexos;
  RAISE NOTICE '084: pedido_pdf_url corrigidos em % linha(s)', v_pdf;
  RAISE NOTICE '084: nf_pdf_url corrigidos em % linha(s)', v_nf;
END $$;

-- ── notas_fiscais_fat_direto.arquivo_url ──
-- Em bloco separado e guardado: a coluna veio da migration 021 e este
-- projeto ja teve migration que nao rodou (ver 083). Se a coluna nao
-- existir, a migration segue em vez de abortar.
DO $$
DECLARE
  v_destino TEXT := 'https://ktfoozriunzoeeoqfpns.supabase.co/storage/v1/object/public/faturamento-direto/';
  v_padrao  TEXT := 'https?://[^/"]+/storage/v1/object/public/faturamento-direto/';
  v_qtd     INTEGER := 0;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'notas_fiscais_fat_direto'
       AND column_name  = 'arquivo_url'
  ) THEN
    UPDATE public.notas_fiscais_fat_direto
       SET arquivo_url = regexp_replace(arquivo_url, v_padrao, v_destino, 'g')
     WHERE arquivo_url IS NOT NULL
       AND regexp_replace(arquivo_url, v_padrao, v_destino, 'g') IS DISTINCT FROM arquivo_url;
    GET DIAGNOSTICS v_qtd = ROW_COUNT;
    RAISE NOTICE '084: notas_fiscais_fat_direto.arquivo_url corrigidos em % linha(s)', v_qtd;
  ELSE
    RAISE NOTICE '084: coluna notas_fiscais_fat_direto.arquivo_url ausente — pulado.';
  END IF;
END $$;

-- ── Conferencia final: nao pode sobrar host errado ──
DO $$
DECLARE
  v_resto INTEGER;
BEGIN
  SELECT count(*) INTO v_resto
    FROM public.solicitacoes_fat_direto
   WHERE pedido_anexos::text ILIKE '%XXXXXXXXXXXX.supabase.co%'
      OR pedido_pdf_url      ILIKE '%XXXXXXXXXXXX.supabase.co%';

  IF v_resto = 0 THEN
    RAISE NOTICE '084: OK — nenhuma URL com host placeholder restante.';
  ELSE
    RAISE EXCEPTION '084: ainda restam % linha(s) com host placeholder.', v_resto;
  END IF;
END $$;
