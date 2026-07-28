-- ---------------------------------------------------------------------------
-- 082 — Conferir se o congelamento resolveu a MED-003 (e não regrediu a 004)
--
-- SOMENTE LEITURA. Roda depois do deploy do commit que trava material_medido/
-- servico_medido no boletim de medições aprovadas usando o snapshot da
-- migration 074 (valor_material_correspondente/valor_servico_correspondente).
--
-- Antes do fix (081, J1): MED-003 mostrava material 216.508,98 ao vivo contra
-- 207.739,55 congelado — drift de R$ 8.769,43 surgido depois da aprovação.
-- Depois do fix, o boletim deve voltar a mostrar o valor CONGELADO — que já
-- batia com a FIP quase ao centavo (207.739,56).
--
-- Esta consulta não chama a função TypeScript (ela roda no servidor Next.js,
-- não no Postgres) — ela só re-confere a mesma comparação de antes pra
-- constatar que os números congelados continuam lá. A confirmação real é
-- abrir a tela da MED-003 no navegador e ver se "Material correspondente"
-- mudou de R$ 216.508,98 pra R$ 216.508,84 (deveria ler o valor congelado
-- diretamente da coluna, sem mais recalcular).
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- ---------------------------------------------------------------------------
SELECT m.numero,
       ROUND(m.valor_material_correspondente, 2)                              AS material_que_a_tela_deve_mostrar,
       ROUND(m.valor_total - COALESCE(m.valor_material_correspondente, 0), 2) AS servico_que_a_tela_deve_mostrar,
       ROUND(m.valor_retencao_garantia, 2)                                    AS retencao_que_a_tela_deve_mostrar,
       ROUND(m.valor_total - COALESCE(m.valor_material_correspondente, 0)
             - m.valor_retencao_garantia
             - COALESCE(m.ajuste_material_anterior, 0), 2)                    AS liquido_que_a_tela_deve_mostrar
  FROM medicoes m
 WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND m.numero IN (3, 4)
 ORDER BY m.numero;
