-- Migration 023: Vínculo usuário ↔ contrato (N:N)
--
-- Permite atrelar um ou mais contratos a um usuário.
-- Usado para:
--   1) filtrar a tela global de medições ao escopo do usuário
--   2) habilitar o botão "Nova medição" para quem tem contrato vinculado
--   3) no futuro: filtrar dashboards e relatórios
--
-- Aponta para a tabela `perfis` (que referencia auth.users), NÃO para
-- a tabela legada `usuarios` da migration 001.

CREATE TABLE IF NOT EXISTS usuarios_contratos (
  usuario_id  UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  contrato_id UUID NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usuario_id, contrato_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_contratos_contrato
  ON usuarios_contratos (contrato_id);

-- RLS
ALTER TABLE usuarios_contratos ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler os próprios vínculos
CREATE POLICY "leitura_proprios_contratos" ON usuarios_contratos
  FOR SELECT USING (usuario_id = auth.uid());

-- Admin pode ler todos os vínculos
CREATE POLICY "admin_leitura_todos_contratos" ON usuarios_contratos
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

-- Escrita apenas via service role (API backend)
