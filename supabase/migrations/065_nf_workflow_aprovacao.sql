-- Migration 065: Workflow de aprovação de NF de faturamento direto
-- ----------------------------------------------------------------------
-- A contratada lança a NF; o contratante aprova/rejeita o lançamento.
-- Estados: aguardando_aprovacao -> aprovada | em_correcao (-> reenvio).
-- Idempotente: pode rodar várias vezes.

-- 1) Colunas novas
ALTER TABLE notas_fiscais_fat_direto
  ADD COLUMN IF NOT EXISTS lancado_por_id  UUID REFERENCES perfis(id),
  ADD COLUMN IF NOT EXISTS lancado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT;

COMMENT ON COLUMN notas_fiscais_fat_direto.lancado_por_id IS
  'Perfil que lançou a NF (contratada). NULL para NFs legadas.';
COMMENT ON COLUMN notas_fiscais_fat_direto.lancado_em IS
  'Quando a NF foi lançada.';
COMMENT ON COLUMN notas_fiscais_fat_direto.motivo_rejeicao IS
  'Motivo da última rejeição (sobrescrito a cada ciclo; histórico fica no audit_log).';

-- 2) Migra dados existentes ANTES de apertar o CHECK
--    pendente/validada -> aprovada (lançadas pelo contratante, confiáveis)
--    rejeitada -> cancelada (no novo modelo a rejeição é a volta em_correcao)
ALTER TABLE notas_fiscais_fat_direto DROP CONSTRAINT IF EXISTS notas_fiscais_fat_direto_status_check;

UPDATE notas_fiscais_fat_direto SET status = 'aprovada'  WHERE status IN ('pendente', 'validada');
UPDATE notas_fiscais_fat_direto SET status = 'cancelada' WHERE status = 'rejeitada';

-- 3) Novo CHECK — só os 4 estados do workflow
ALTER TABLE notas_fiscais_fat_direto
  ADD CONSTRAINT notas_fiscais_fat_direto_status_check
  CHECK (status IN ('aguardando_aprovacao', 'aprovada', 'em_correcao', 'cancelada'));

-- 4) Default seguro pra novos inserts que não definirem status
ALTER TABLE notas_fiscais_fat_direto ALTER COLUMN status SET DEFAULT 'aguardando_aprovacao';

-- 5) Índice pra fila de aprovação
CREATE INDEX IF NOT EXISTS idx_nf_fatd_status ON notas_fiscais_fat_direto(status);

-- 6) Permissão: a contratada (template "Engenheiro FIP") pode lançar NF.
--    A aprovação fica com admin (admin já tem bypass total de permissões).
UPDATE templates_permissao
   SET permissoes = permissoes || '[{"modulo":"nf_fat_direto","acao":"lancar"}]'::jsonb
 WHERE nome = 'Engenheiro FIP'
   AND NOT (permissoes @> '[{"modulo":"nf_fat_direto","acao":"lancar"}]'::jsonb);
