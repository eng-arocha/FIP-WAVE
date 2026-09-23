-- ---------------------------------------------------------------------------
-- 083 — As colunas de snapshot por item que a migration 052 nunca aplicou
--
-- O ACHADO
--
-- `medicao_itens.valor_material_correspondente` e
-- `medicao_itens.valor_servico_correspondente` NÃO EXISTEM na base, embora a
-- migration 052 as declare. A 052 tem duas partes — uma em `medicao_itens`,
-- outra em `medicoes` — e só a segunda chegou; a 070 (catch-up) também só
-- refez a de `medicoes`. `nf_material_descontada` veio depois, pela 074, e
-- existe normalmente.
--
-- POR QUE ISSO CUSTOU DINHEIRO
--
-- Na aprovação, `aprovarMedicao` grava os três valores do item num UPDATE só:
--
--     { valor_material_correspondente, valor_servico_correspondente,
--       nf_material_descontada }
--
-- Com duas das três colunas ausentes, o UPDATE falha com 42703. O código trata
-- isso como "schema ainda não atualizado" e tenta de novo SEM
-- `nf_material_descontada` — mas o retry usa justamente as duas colunas que
-- não existem, falha igual, e o erro é engolido.
--
-- Resultado: `nf_material_descontada` NUNCA foi gravada por aprovação nenhuma.
-- As medições 1 a 4 só têm valor porque foram reparadas à mão (ver
-- manual-fixes/085). A Medição 5 aprovou com os 49 itens em zero, e por isso o
-- pendente de lastro dela — R$ 60.193,41 — sumiu da fila.
--
-- A aprovação devolveu sucesso nas duas situações. Nada no produto avisou.
--
-- O QUE ESTA MIGRATION FAZ
--
-- Cria as duas colunas e preenche as medições existentes com
-- `quantidade_medida × valor unitário do detalhamento` — a mesma conta que a
-- aprovação faria. É idempotente: rodar duas vezes não muda nada.
--
-- Ela NÃO reconstrói `nf_material_descontada` da Medição 5; isso é o
-- manual-fixes/089, que depende destas colunas existirem e deve rodar depois.
-- ---------------------------------------------------------------------------

-- 1) As colunas que faltavam.
ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS valor_material_correspondente NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_material_correspondente >= 0),
  ADD COLUMN IF NOT EXISTS valor_servico_correspondente  NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_servico_correspondente >= 0);

COMMENT ON COLUMN medicao_itens.valor_material_correspondente IS
  'Snapshot do material deste item (qtde × det.valor_material_unit). Congelado na aprovação.';
COMMENT ON COLUMN medicao_itens.valor_servico_correspondente IS
  'Snapshot do serviço deste item (qtde × det.valor_servico_unit). Congelado na aprovação.';

-- 2) Preenche o que já existe. Só onde ainda está zerado, para não sobrescrever
--    snapshot legítimo de medição aprovada caso alguma linha já tenha valor.
UPDATE medicao_itens mi
   SET valor_material_correspondente =
         ROUND(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0), 2),
       valor_servico_correspondente  =
         ROUND(mi.quantidade_medida * COALESCE(d.valor_servico_unit, 0), 2)
  FROM detalhamentos d
 WHERE d.id = mi.detalhamento_id
   AND mi.valor_material_correspondente = 0
   AND mi.valor_servico_correspondente = 0;

-- 3) Conferência: material + serviço por medição.
SELECT m.numero,
       m.status,
       COUNT(*)                                              AS itens,
       ROUND(SUM(mi.valor_material_correspondente), 2)       AS material,
       ROUND(SUM(mi.valor_servico_correspondente), 2)        AS servico,
       ROUND(SUM(mi.nf_material_descontada), 2)              AS snapshot_desconto
  FROM medicao_itens mi
  JOIN medicoes m ON m.id = mi.medicao_id
 GROUP BY m.numero, m.status
 ORDER BY m.numero;
