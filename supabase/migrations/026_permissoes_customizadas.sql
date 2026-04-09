-- Migration 026: Permissões customizadas por usuário + vínculo perfil↔template
--
-- Mudanças arquiteturais:
-- 1) Nova coluna perfis.permissoes_customizadas:
--    - false (padrão): usuário herda permissões do template (templates_permissao)
--    - true: usuário tem permissões frozen em permissoes_usuario (ilha)
-- 2) Backfill: usuários existentes com perfis nativos ganham template_id apontando
--    para o template correspondente (se o template existir no banco)
-- 3) Cria o template "Administrativo Wave" VAZIO (admin configura manualmente)
--
-- OBS: esta migration NÃO mexe nas permissões dos templates existentes
-- (Administrador, Engenheiro FIP, Visualizador) — eles continuam como estão.
-- Se você quiser zerar manualmente, use o SQL Editor depois.

-- 1) Flag por usuário
ALTER TABLE perfis
  ADD COLUMN IF NOT EXISTS permissoes_customizadas BOOLEAN NOT NULL DEFAULT false;

-- 2) Backfill de template_id para usuários com perfis nativos
-- Só aplica se o usuário ainda não tem template_id definido.
UPDATE perfis p
SET    template_id = t.id
FROM   templates_permissao t
WHERE  p.template_id IS NULL
  AND  t.sistema = true
  AND  (
        (p.perfil = 'admin'          AND t.nome = 'Administrador')
     OR (p.perfil = 'engenheiro_fip' AND t.nome = 'Engenheiro FIP')
     OR (p.perfil = 'visualizador'   AND t.nome = 'Visualizador')
       );

-- 3) Cria o template "Administrativo Wave" vazio (customizado, não-sistema)
-- Se já existir (por ex. rodar a migration duas vezes), não duplica.
INSERT INTO templates_permissao (nome, descricao, sistema, permissoes)
VALUES (
  'Administrativo Wave',
  'Equipe administrativa Wave — configurar permissões em /perfis',
  false,
  '[]'::jsonb
)
ON CONFLICT (nome) DO NOTHING;

-- 4) Recarrega schema cache
NOTIFY pgrst, 'reload schema';
