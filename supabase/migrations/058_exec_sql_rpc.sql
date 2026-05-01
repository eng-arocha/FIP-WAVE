-- Migration 058: RPC exec_sql para fallback do auto-migrate
-- ----------------------------------------------------------------------
-- Em ambientes onde a conexão TCP direta com o pooler do Supabase falha
-- (ex.: Vercel Functions bloqueando saída para porta 5432), o auto-migrate
-- precisa de um caminho alternativo para aplicar SQL via PostgREST.
--
-- Esta função:
--   - Roda com SECURITY DEFINER → executa com privilégios do owner (postgres)
--   - É revogada de anon/authenticated → só service_role pode chamar
--   - Não retorna nada (void). Erros propagam normalmente como exceção
--     PostgREST (status 4xx/5xx + JSON body), que o cliente trata.
--
-- IMPORTANTE — bootstrap manual:
-- Esta migration tem que ser aplicada UMA VEZ via Supabase SQL Editor antes
-- do código que depende dela conseguir rodar (galinha-e-ovo: o auto-migrate
-- só consegue criar a função se já existir um caminho de execução, e o
-- caminho RPC depende da função existir). A partir da próxima migration,
-- o auto-migrate consegue se virar sozinho via fallback.

CREATE OR REPLACE FUNCTION public.exec_sql(p_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
BEGIN
  EXECUTE p_sql;
END;
$func$;

COMMENT ON FUNCTION public.exec_sql(text) IS
  'Fallback usado pelo auto-migrate quando a conexão postgres direta falha. Restrito a service_role. Cada chamada executa um único statement SQL. NÃO usar fora do contexto de migrations.';

-- Tira acesso de qualquer role exposta ao PostgREST público
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.exec_sql(text) FROM authenticated;

-- Garante que service_role pode chamar
GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
