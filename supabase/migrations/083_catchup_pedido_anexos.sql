-- ============================================================
-- 083 — Catch-up da coluna solicitacoes_fat_direto.pedido_anexos
--       (migration 016) + reload do schema cache
-- ============================================================
-- Contexto: os anexos do pedido (orçamento + pedido Sienge) que o
-- Fornecedor FIP sobe na criação da solicitação NUNCA apareciam na
-- página do pedido. A causa raiz é que a coluna `pedido_anexos`,
-- criada pela migration 016, não existe no banco de produção — a 016
-- nunca rodou lá. Confirmado no SQL Editor:
--     42703: column "pedido_anexos" does not exist
--
-- Encadeamento do sintoma:
--   1. lib/fat-direto-upload.ts sobe o arquivo pro Storage via signed
--      URL (isso FUNCIONA — os arquivos estão em faturamento-direto/
--      pedidos/{solId}/);
--   2. o POST /api/fat-direto/upload que registra a lista em
--      `pedido_anexos` morria em coluna inexistente e o arquivo ficava
--      órfão no bucket;
--   3. getSolicitacao caía no select degradado (withSchemaFallback),
--      que não traz anexo nenhum, e a tela dizia "Sem anexo no pedido".
--
-- A migration 070 foi escrita justamente pra fazer catch-up de colunas
-- faltando (013/025/039) e deixou a 016 de fora. Esta fecha a lacuna.
--
-- 100% IDEMPOTENTE: re-executa o ADD COLUMN IF NOT EXISTS da 016 com
-- o mesmo tipo/default e força o reload do schema cache. Rodar mais de
-- uma vez não tem efeito colateral.
-- ============================================================

-- ── solicitacoes_fat_direto (migration 016) ──
ALTER TABLE public.solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS pedido_anexos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.solicitacoes_fat_direto.pedido_anexos IS
  'Lista de anexos do pedido: [{nome, url, tamanho, tipo}]';

-- ── Recarrega o schema cache do PostgREST ──
-- Sem isto o PostgREST segue devolvendo PGRST204 ("Could not find the
-- column 'pedido_anexos' in the schema cache") mesmo depois do ALTER.
NOTIFY pgrst, 'reload schema';

-- ── Confirmação ──
DO $$
DECLARE
  v_existe BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'solicitacoes_fat_direto'
       AND column_name  = 'pedido_anexos'
  ) INTO v_existe;

  IF v_existe THEN
    RAISE NOTICE '083: coluna solicitacoes_fat_direto.pedido_anexos PRESENTE.';
  ELSE
    RAISE EXCEPTION '083: coluna solicitacoes_fat_direto.pedido_anexos AUSENTE apos o ALTER TABLE.';
  END IF;
END $$;
