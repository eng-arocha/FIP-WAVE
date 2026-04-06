-- Migration 012: Vincula perfis de usuário a templates personalizados
-- Permite criar roles customizadas além das 3 nativas (admin/engenheiro_fip/visualizador)

-- Adiciona template_id opcional na tabela perfis
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES templates_permissao(id) ON DELETE SET NULL;

-- Índice
CREATE INDEX IF NOT EXISTS idx_perfis_template ON perfis(template_id);

-- Adiciona permissão de 'perfis' ao template Administrador (para que admin veja a página de Perfis no sidebar)
UPDATE templates_permissao
SET permissoes = permissoes || '[
  {"modulo":"perfis","acao":"visualizar"},
  {"modulo":"perfis","acao":"criar"},
  {"modulo":"perfis","acao":"editar"},
  {"modulo":"perfis","acao":"excluir"}
]'::jsonb
WHERE nome = 'Administrador';

-- Adiciona permissão perfis:visualizar para Engenheiro FIP (apenas leitura)
-- Remova esta linha se não quiser que Engenheiro FIP veja a página de Perfis
-- UPDATE templates_permissao SET permissoes = permissoes || '[{"modulo":"perfis","acao":"visualizar"}]'::jsonb WHERE nome = 'Engenheiro FIP';
