-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 081 — Retrato do Informakon NOTA A NOTA
--
-- PROBLEMA QUE A 080 DEIXOU ABERTO
--
-- A 080 guardou o "Vlr. a Desc" somado por macro item. Isso responde QUANTO
-- falta lançar ("faltam R$ 56.593,86 em COMBATE AO INCÊNDIO"), mas não
-- responde QUAL nota falta — e é a nota que se lança no ERP. Sem o número,
-- a única saída era heurística: listar as notas do grupo da mais recente
-- para a mais antiga e apostar nas de cima.
--
-- SOLUÇÃO
--
-- A mesma grade do ERP, colada crua, tem uma linha por NOTA:
--
--   Documento   Insumo  Especificação                    Un   Qtd.a Desc  Vlr. a Desc  Qtd.Desc  Vlr.Desc
--   NF-e 534    71635   Faturamento direto - QUADROS...  R$   253.444,08  253.444,08   0,0000    0,00
--
-- Com o número da nota a conferência deixa de ser estatística e vira
-- casamento: nota que o FIP-WAVE tem e o Informakon não → não foi lançada.
-- E o `Vlr.Desc` (o que o ERP já consumiu em medições passadas) permite
-- conferir o acumulado, não só o período.
--
-- POR QUE UMA TABELA NOVA E NÃO informakon_nf_linhas (migration 075)
--
-- Aquela tabela é o retrato do xlsx completo e tem `entrada` NOT NULL
-- ('155645/001'), que é a chave real do ERP e NÃO existe nesta grade.
-- Sintetizar uma entrada falsa poluiria a conciliação por entrada que já
-- roda em cima dela. Aqui a linha pendura no snapshot da 080, que é
-- justamente o retrato "colado à mão" — o agregado por macro item continua
-- em `informakon_saldo_linhas` (agora derivado das notas), e o detalhe mora
-- nesta tabela.
--
-- Idempotente: CREATE TABLE / ADD COLUMN IF NOT EXISTS. Snapshot antigo
-- (colagem agregada) simplesmente não tem notas — a UI cai no modo anterior.
-- ═══════════════════════════════════════════════════════════════════════════

-- Qual layout foi colado, para a UI saber se pode conferir nota a nota.
ALTER TABLE informakon_saldo_snapshots
  ADD COLUMN IF NOT EXISTS formato TEXT NOT NULL DEFAULT 'agregado';

-- Σ "Vlr.Desc": o que o ERP JÁ descontou. Só existe no layout detalhado.
ALTER TABLE informakon_saldo_snapshots
  ADD COLUMN IF NOT EXISTS total_descontado NUMERIC(15,2) NOT NULL DEFAULT 0;

ALTER TABLE informakon_saldo_snapshots
  ADD COLUMN IF NOT EXISTS total_descontado_informado NUMERIC(15,2);

-- Σ "Vlr.Desc" do macro item — espelha o agregado do snapshot por grupo.
ALTER TABLE informakon_saldo_linhas
  ADD COLUMN IF NOT EXISTS valor_descontado NUMERIC(15,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS informakon_saldo_notas (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  snapshot_id         UUID NOT NULL REFERENCES informakon_saldo_snapshots(id) ON DELETE CASCADE,
  /** 'NF-e 534' — texto da coluna Documento, como veio. */
  documento           TEXT NOT NULL,
  /** 'NF-e' | 'NFS-e'. */
  tipo_doc            TEXT,
  /** '534' — só os dígitos. É por aqui que casa com notas_fiscais_fat_direto. */
  numero_nf           TEXT,
  /** Código do insumo do ERP (71635 = faturamento direto). Rastreabilidade. */
  insumo              TEXT,
  /** Rótulo da Especificação, como veio. */
  macro_item          TEXT NOT NULL,
  /** De-para resolvido (lib/informakon/parser.ts). NULL = não reconhecido. */
  grupo_codigo        TEXT,
  /** '19.1.1' / '19.1.2' — o grupo 19 vem quebrado em detalhamento. */
  detalhamento_codigo TEXT,
  /** Lançado no ERP e ainda disponível para descontar. */
  valor_a_descontar   NUMERIC(15,2) NOT NULL DEFAULT 0,
  /** O ERP já consumiu em medição anterior. */
  valor_descontado    NUMERIC(15,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_informakon_saldo_notas_snap
  ON informakon_saldo_notas (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_informakon_saldo_notas_numero
  ON informakon_saldo_notas (snapshot_id, numero_nf);

COMMENT ON TABLE informakon_saldo_notas IS
  'Retrato do Informakon nota a nota (Documento / Vlr. a Desc / Vlr.Desc), colado da grade do ERP. Permite dizer QUAL nota falta lançar, em vez de só quanto falta.';

ALTER TABLE informakon_saldo_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS informakon_saldo_notas_select ON informakon_saldo_notas;
CREATE POLICY informakon_saldo_notas_select ON informakon_saldo_notas
  FOR SELECT TO authenticated USING (true);

-- Conferência
SELECT 'informakon_saldo_notas' AS tabela,
       to_regclass('public.informakon_saldo_notas') IS NOT NULL AS existe
UNION ALL
SELECT 'informakon_saldo_snapshots.formato',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'informakon_saldo_snapshots' AND column_name = 'formato')
UNION ALL
SELECT 'informakon_saldo_linhas.valor_descontado',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'informakon_saldo_linhas' AND column_name = 'valor_descontado');
