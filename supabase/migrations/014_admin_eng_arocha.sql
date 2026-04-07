-- Migration 014: Garante que eng.arocha@gmail.com é admin
UPDATE perfis SET perfil = 'admin' WHERE email = 'eng.arocha@gmail.com';

-- Se não existe na tabela perfis, insere via auth.users
INSERT INTO perfis (id, nome, email, perfil, ativo)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'nome', split_part(email, '@', 1)), email, 'admin', true
FROM auth.users
WHERE email = 'eng.arocha@gmail.com'
ON CONFLICT (id) DO UPDATE SET perfil = 'admin';
