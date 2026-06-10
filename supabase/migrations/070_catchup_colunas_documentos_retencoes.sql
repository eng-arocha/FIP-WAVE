-- ============================================================
-- 070 — Catch-up de colunas usadas pelas telas de Documentos
--       (Pedidos FD) e Retenções + reload do schema cache
-- ============================================================
-- Contexto: as páginas /documentos/faturamento-direto e
-- /documentos/retencoes vinham mostrando "vazio" porque as queries
-- dependem de colunas adicionadas pelas migrations 013/025/038/039/
-- 051/052 — se alguma não rodou no Supabase (ou o schema cache do
-- PostgREST está desatualizado), o endpoint devolvia erro e a página
-- ficava em branco.
--
-- Esta migration é 100% IDEMPOTENTE: re-executa as ADD COLUMN IF NOT
-- EXISTS das migrations originais (mesmos tipos/defaults) e força o
-- reload do schema cache. Rodar mais de uma vez não tem efeito colateral.
-- ============================================================

-- ── solicitacoes_fat_direto (migrations 013, 025, 009/039) ──
ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS pedido_pdf_url    TEXT,
  ADD COLUMN IF NOT EXISTS pedido_pdf_nome   TEXT,
  ADD COLUMN IF NOT EXISTS nf_numero         TEXT,
  ADD COLUMN IF NOT EXISTS nf_data           DATE,
  ADD COLUMN IF NOT EXISTS nf_pdf_url        TEXT,
  ADD COLUMN IF NOT EXISTS numero_pedido_fip INTEGER,
  ADD COLUMN IF NOT EXISTS deletado_em       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletado_por      UUID REFERENCES perfis(id) ON DELETE SET NULL;

ALTER TABLE solicitacoes_fat_direto
  ADD COLUMN IF NOT EXISTS status_documento TEXT NOT NULL DEFAULT 'pendente_nf'
    CHECK (status_documento IN ('pendente_nf', 'nf_recebida', 'pago'));

-- ── medicoes (migrations 038, 051, 052) ──
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS valor_retencao_garantia NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS andamento_fisico_pct NUMERIC(7,4),
  ADD COLUMN IF NOT EXISTS valor_financeiro_proporcional NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS valor_material_correspondente NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico_correspondente  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- ── contratos (migration 051) ──
ALTER TABLE contratos
  ADD COLUMN IF NOT EXISTS percentual_retencao NUMERIC(5,2) NOT NULL DEFAULT 5.00;

-- ── Recarrega o schema cache do PostgREST ──
-- Resolve erros "Could not find the column 'X' in the schema cache"
-- mesmo quando a coluna JÁ existe no banco.
NOTIFY pgrst, 'reload schema';
