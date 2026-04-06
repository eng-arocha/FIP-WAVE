-- Migration 010: Tabela de templates de perfil/permissão gerenciáveis pelo admin

CREATE TABLE IF NOT EXISTS templates_permissao (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT NOT NULL UNIQUE,
  descricao   TEXT,
  sistema     BOOLEAN NOT NULL DEFAULT false, -- true = nativo, não pode excluir
  permissoes  JSONB NOT NULL DEFAULT '[]',
  criado_em   TIMESTAMPTZ DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Índice
CREATE INDEX IF NOT EXISTS idx_templates_permissao_nome ON templates_permissao(nome);

-- RLS
ALTER TABLE templates_permissao ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler templates
CREATE POLICY "autenticados podem ler templates"
  ON templates_permissao FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Apenas admin pode inserir/atualizar/excluir
CREATE POLICY "admin pode gerenciar templates"
  ON templates_permissao FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM perfis
      WHERE perfis.id = auth.uid()
        AND perfis.perfil = 'admin'
    )
  );

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION update_templates_permissao_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_templates_permissao_ts
  BEFORE UPDATE ON templates_permissao
  FOR EACH ROW EXECUTE FUNCTION update_templates_permissao_ts();

-- Seed: perfis nativos do sistema
INSERT INTO templates_permissao (nome, descricao, sistema, permissoes) VALUES
(
  'Administrador',
  'Acesso total ao sistema',
  true,
  '[
    {"modulo":"dashboard","acao":"visualizar"},
    {"modulo":"contratos","acao":"visualizar"},{"modulo":"contratos","acao":"criar"},{"modulo":"contratos","acao":"editar"},{"modulo":"contratos","acao":"excluir"},
    {"modulo":"medicoes","acao":"visualizar"},{"modulo":"medicoes","acao":"criar"},{"modulo":"medicoes","acao":"editar"},{"modulo":"medicoes","acao":"aprovar"},
    {"modulo":"aprovacoes","acao":"visualizar"},{"modulo":"aprovacoes","acao":"aprovar"},
    {"modulo":"empresas","acao":"visualizar"},{"modulo":"empresas","acao":"criar"},{"modulo":"empresas","acao":"editar"},{"modulo":"empresas","acao":"excluir"},
    {"modulo":"usuarios","acao":"visualizar"},{"modulo":"usuarios","acao":"criar"},{"modulo":"usuarios","acao":"editar"},{"modulo":"usuarios","acao":"excluir"}
  ]'
),
(
  'Engenheiro FIP',
  'Acesso operacional completo',
  true,
  '[
    {"modulo":"dashboard","acao":"visualizar"},
    {"modulo":"contratos","acao":"visualizar"},{"modulo":"contratos","acao":"criar"},{"modulo":"contratos","acao":"editar"},
    {"modulo":"medicoes","acao":"visualizar"},{"modulo":"medicoes","acao":"criar"},{"modulo":"medicoes","acao":"editar"},{"modulo":"medicoes","acao":"aprovar"},
    {"modulo":"aprovacoes","acao":"visualizar"},{"modulo":"aprovacoes","acao":"aprovar"},
    {"modulo":"empresas","acao":"visualizar"},{"modulo":"empresas","acao":"criar"},{"modulo":"empresas","acao":"editar"},
    {"modulo":"usuarios","acao":"visualizar"}
  ]'
),
(
  'Visualizador',
  'Apenas leitura em todos os módulos',
  true,
  '[
    {"modulo":"dashboard","acao":"visualizar"},
    {"modulo":"contratos","acao":"visualizar"},
    {"modulo":"medicoes","acao":"visualizar"},
    {"modulo":"aprovacoes","acao":"visualizar"},
    {"modulo":"empresas","acao":"visualizar"},
    {"modulo":"usuarios","acao":"visualizar"}
  ]'
)
ON CONFLICT (nome) DO NOTHING;
