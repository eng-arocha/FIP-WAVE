-- ---------------------------------------------------------------------------
-- 095 — MED-007: devolver ao 1.3.1 o corte por falta de lastro
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição:  2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed (MED-007, aprovada 27/10/2026)
--
-- O PROBLEMA
--
-- `aprovarMedicao` marcava a medição como 'aprovado' e SÓ DEPOIS calculava o
-- boletim que congela `medicao_itens.nf_material_descontada`. O boletim de
-- medição aprovada não aplica o retrato do Informakon, então o snapshot saiu
-- com o desconto IDEAL, sem o corte. Corrigido no código no mesmo commit.
--
-- Na MED-007 isso atingiu um item só, o 1.3.1:
--     congelado      320.380,45  (100,0000%)
--     correto        288.463,87  ( 90,8530%) — o % digitado no Informakon
--     corte          31.916,58   (notas MSF/Cordeiro ainda fora do Informakon)
--
-- Sem a correção o site dá esses R$ 31.916,58 como já descontados e eles
-- nunca voltam. Com ela, voltam sozinhos na medição em que as notas entrarem
-- no Informakon, destacados em verde no boletim.
--
-- Rode os blocos NA ORDEM. O bloco 1 tem de devolver 320380.45.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- ===========================================================================
SELECT mi.id, d.codigo, mi.nf_material_descontada
FROM medicao_itens mi
JOIN detalhamentos d ON d.id = mi.detalhamento_id
WHERE mi.id = '53154fda-03fd-40d9-8c02-07ee984fdfe8'
  AND mi.medicao_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO. Só altera se o valor ainda for o congelado errado.
-- ===========================================================================
UPDATE medicao_itens
SET nf_material_descontada = 288463.87
WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8'
  AND medicao_id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed'
  AND detalhamento_id = '3b5a31c5-c310-5ab0-a78f-2a9cca1293f8'
  AND nf_material_descontada = 320380.45
RETURNING id, nf_material_descontada;
