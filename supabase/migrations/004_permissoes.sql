-- Migration 004: Permissões granulares por usuário

CREATE TABLE permissoes_usuario (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
  modulo     TEXT NOT NULL,
  acao       TEXT NOT NULL,
  UNIQUE(user_id, modulo, acao)
);

ALTER TABLE permissoes_usuario ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler suas próprias permissões
CREATE POLICY "leitura_proprias_permissoes" ON permissoes_usuario
  FOR SELECT USING (user_id = auth.uid());

-- Admin pode ler todas as permissões
CREATE POLICY "admin_leitura_permissoes" ON permissoes_usuario
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

-- Escrita apenas via service role (backend)
