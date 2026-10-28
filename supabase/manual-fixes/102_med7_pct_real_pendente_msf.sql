-- ---------------------------------------------------------------------------
-- 102 — MED-007 na regra do "% real": volta o pendente da MSF/Cordeiro
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição:  2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed (MED-007)
-- Spec:     docs/superpowers/specs/2026-10-28-congelar-informakon-e-cortes.md
--
-- O 097 gravou o snapshot de desconto do 1.3.1 em 320.380,45 (100%) para o
-- boletim reimpresso mostrar o item 100% lançado. Mas o Informakon NÃO
-- descontou as notas da MSF/Cordeiro na MED-007: o material da tela dele
-- (1.263.229,98) fica R$ 806,32 acima do site, não R$ 31.916,58. Com o
-- snapshot em 100%, o site acha que esse material já foi descontado e nunca
-- mais o cobra.
--
-- Com a regra do % real (migration 086), o percentual lançado sai do físico,
-- não do desconto. Então o snapshot pode voltar ao que foi de fato
-- descontado (288.463,87) sem o boletim deixar de mostrar 100%:
--   - os R$ 31.916,58 reaparecem como pendente do 1.3.1 na MED-008;
--   - são descontados sozinhos quando as notas entrarem no Informakon (o
--     lastro do grupo 1 sobe), sem mexer no % e sem entrar na retenção.
--
-- NÃO mexe em: totais congelados da MED-007, livro-razão, pedido nº 21.
-- Substitui o SQL de ajuste manual anotado no DIVIDAS (que geraria o pedido
-- Wave da MED-008 R$ 31.916,58 acima).
--
-- Rode os blocos NA ORDEM. O bloco 2 recusa sozinho se algo não bater.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- BLOCO 1 — PRÉVIA. Nada é alterado.
-- Esperado: 320380.45 | 1834551.81 | 1263229.98 | 91727.59 | 33.70 | 479560.54
-- e, na segunda consulta, o 1.3.1 com material contratado 320.380,45.
-- ===========================================================================
SELECT
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8')                       AS snap_131,
  m.valor_total, m.valor_material_correspondente, m.valor_retencao_garantia,
  m.ajuste_material_anterior,
  (SELECT valor_total FROM solicitacoes_fat_direto
    WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                       AS pedido_21
FROM medicoes m
WHERE m.id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';

-- Material do 1.3.1 e o que cada medição aprovada já descontou dele.
SELECT d.codigo,
       round(d.quantidade_contratada * d.valor_material_unit, 2)               AS material_contratado,
       me.numero, me.status, mi.quantidade_medida, mi.nf_material_descontada
FROM medicao_itens mi
JOIN medicoes me      ON me.id = mi.medicao_id
JOIN detalhamentos d  ON d.id = mi.detalhamento_id
WHERE mi.detalhamento_id = (SELECT detalhamento_id FROM medicao_itens
                             WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8')
ORDER BY me.numero;


-- ===========================================================================
-- BLOCO 2 — CORREÇÃO (transação única).
-- ===========================================================================
ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS regra_pct_real BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
DECLARE
  c_medicao  CONSTANT uuid := '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';
  c_item_131 CONSTANT uuid := '53154fda-03fd-40d9-8c02-07ee984fdfe8';
  v_status   text;
BEGIN
  SELECT status INTO v_status FROM medicoes WHERE id = c_medicao;
  IF v_status IS DISTINCT FROM 'aprovado' THEN
    RAISE EXCEPTION 'MED-007 não está aprovada (status %)', v_status;
  END IF;

  -- 1. MED-007 foi lançada pelo % físico (1.3.1 a 100% no Informakon).
  UPDATE medicoes SET regra_pct_real = TRUE WHERE id = c_medicao;

  -- 2. Snapshot do 1.3.1 = o que o Informakon de fato descontou.
  UPDATE medicao_itens SET nf_material_descontada = 288463.87
   WHERE id = c_item_131 AND medicao_id = c_medicao AND nf_material_descontada = 320380.45;
  IF NOT FOUND THEN RAISE EXCEPTION '1.3.1 com snapshot inesperado (esperado 320380.45)'; END IF;

  RAISE NOTICE 'OK: MED-007 na regra do %% real; pendente de 31.916,58 no 1.3.1';
END $$;

NOTIFY pgrst, 'reload schema';


-- ===========================================================================
-- BLOCO 3 — CONFERÊNCIA.
-- Esperado: true | 288463.87 | 1834551.81 | 1263229.98 | 91727.59 | 33.70 | 479560.54
-- Depois, no site: boletim da MED-007 com o 1.3.1 a 100% e NF Wave
-- 479.560,54; prévia da MED-008 com 31.916,58 pendente no 1.3.1.
-- ===========================================================================
SELECT
  m.regra_pct_real,
  (SELECT nf_material_descontada FROM medicao_itens
    WHERE id = '53154fda-03fd-40d9-8c02-07ee984fdfe8')                       AS snap_131,
  m.valor_total, m.valor_material_correspondente, m.valor_retencao_garantia,
  m.ajuste_material_anterior,
  (SELECT valor_total FROM solicitacoes_fat_direto
    WHERE id = '7af9da4b-9b98-4dca-8dc0-0dea6644f167')                       AS pedido_21
FROM medicoes m
WHERE m.id = '2bbb4ccc-ab8c-4af6-a4dc-347c5ef341ed';
