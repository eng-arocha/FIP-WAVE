-- ============================================================
-- 052 — Retenção contratual: nova fórmula (5% sobre material + serviço medidos)
-- ============================================================
-- Substitui a fórmula antiga (5% × valor_proporcional via ratio contrato/serviços),
-- que resultava em retenção efetiva ≈ 13% sobre a NF — fora do contrato.
--
-- Nova fórmula (alinhada ao contrato real):
--   Por item medido:
--     material_correspondente_item = quantidade_medida × detalhamento.valor_material_unit
--     servico_medido_item          = quantidade_medida × detalhamento.valor_servico_unit
--     base_retencao_item           = material_correspondente + servico_medido
--     retencao_item                = base_retencao_item × percentual_retencao / 100
--
--   Total da medição:
--     valor_material_correspondente = SUM(material_correspondente_item)
--     valor_retencao_garantia       = SUM(retencao_item)
--
-- Como nenhuma medição foi aprovada ainda, podemos remover a coluna
-- legacy valor_financeiro_proporcional e os snapshots antigos sem perda.
-- ============================================================

-- 1) Snapshot por item (mat e serv "medidos" deste item)
ALTER TABLE medicao_itens
  ADD COLUMN IF NOT EXISTS valor_material_correspondente NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_material_correspondente >= 0),
  ADD COLUMN IF NOT EXISTS valor_servico_correspondente  NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_servico_correspondente >= 0);

COMMENT ON COLUMN medicao_itens.valor_material_correspondente IS
  'Snapshot do material correspondente a este item (qtde × det.valor_material_unit). Congelado na aprovação.';
COMMENT ON COLUMN medicao_itens.valor_servico_correspondente IS
  'Snapshot do serviço deste item (qtde × det.valor_servico_unit). Congelado na aprovação.';

-- 2) Snapshot agregado na medição
ALTER TABLE medicoes
  ADD COLUMN IF NOT EXISTS valor_material_correspondente NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (valor_material_correspondente >= 0);

COMMENT ON COLUMN medicoes.valor_material_correspondente IS
  'Snapshot do total de material correspondente desta medição (soma dos itens). Base de retenção = material_correspondente + valor_total (serviço).';

-- 3) Remove coluna legacy não mais usada
-- (sem ON DELETE: nada referencia essa coluna)
ALTER TABLE medicoes DROP COLUMN IF EXISTS valor_financeiro_proporcional;

-- 4) andamento_fisico_pct continua existindo, mas o significado muda:
-- agora representa o % médio executado por esta medição em relação ao
-- total executado do contrato (snapshot informativo, não usado pra retenção).
COMMENT ON COLUMN medicoes.andamento_fisico_pct IS
  'Snapshot %: (valor_material_correspondente + valor_total) / contrato.valor_total × 100. Informativo.';
