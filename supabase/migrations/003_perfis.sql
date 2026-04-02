-- Migration 003: Sistema de perfis e papéis de usuário

CREATE TYPE perfil_usuario AS ENUM ('visualizador', 'engenheiro_fip', 'admin');

CREATE TABLE perfis (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  email      TEXT NOT NULL,
  perfil     perfil_usuario NOT NULL DEFAULT 'visualizador',
  ativo      BOOLEAN NOT NULL DEFAULT true,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cria perfil automaticamente ao criar um usuário no Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO perfis (id, nome, email, perfil)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'perfil')::perfil_usuario, 'visualizador')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE perfis ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler o próprio perfil
CREATE POLICY "leitura_proprio_perfil" ON perfis
  FOR SELECT USING (id = auth.uid());

-- Admin pode ler todos os perfis
CREATE POLICY "admin_leitura_todos" ON perfis
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM perfis p WHERE p.id = auth.uid() AND p.perfil = 'admin')
  );

-- Apenas service role (API) pode inserir/atualizar/deletar
-- (criação via trigger SECURITY DEFINER, edições via service role no backend)
