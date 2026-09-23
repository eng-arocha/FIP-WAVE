-- 090 — Remove o retrato do Informakon que entrou SEM MACRO ITEM RECONHECIDO.
--
-- Contexto: a grade do ERP foi colada sem tabulação. Sem TAB não há coluna, a
-- leitura detalhada não achou nada e o layout agregado assumiu: cada LINHA DE
-- DADOS inteira virou o "rótulo de um macro item". Resultado: ~251 linhas,
-- nenhuma reconhecida, e esse retrato passou a ser o mais recente do contrato
-- — ou seja, é ele que o boletim está usando como teto de lastro.
--
-- Um retrato em que NENHUMA linha tem grupo_codigo nem detalhamento_codigo não
-- tem uso possível: não há o que comparar com o boletim. É seguro apagar.
-- A partir do commit desta correção a API recusa esse tipo de colagem, então
-- isto é limpeza do que já entrou, não rotina.
--
-- BLOCO 1 — conferir ANTES de apagar. Espere ver o retrato de hoje com
-- reconhecidas = 0. Se algum retrato antigo e legítimo aparecer aqui, PARE.
SELECT
  s.id,
  s.referencia,
  s.informado_em,
  s.total,
  count(l.id)                                                        AS linhas,
  count(l.id) FILTER (WHERE l.grupo_codigo IS NOT NULL
                         OR l.detalhamento_codigo IS NOT NULL)        AS reconhecidas
FROM informakon_saldo_snapshots s
LEFT JOIN informakon_saldo_linhas l ON l.snapshot_id = s.id
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
GROUP BY s.id, s.referencia, s.informado_em, s.total
ORDER BY s.referencia DESC, s.informado_em DESC;

-- BLOCO 2 — apagar só os retratos sem NENHUMA linha reconhecida.
-- As linhas e notas saem por ON DELETE CASCADE (migrations 080/081). Se alguma
-- medição tinha FIXADO esse retrato, o ponteiro só zera (ON DELETE SET NULL da
-- 082) e o boletim volta a usar o retrato mais recente do contrato.
DELETE FROM informakon_saldo_snapshots s
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND NOT EXISTS (
    SELECT 1 FROM informakon_saldo_linhas l
    WHERE l.snapshot_id = s.id
      AND (l.grupo_codigo IS NOT NULL OR l.detalhamento_codigo IS NOT NULL)
  );

-- BLOCO 3 — conferir DEPOIS. O retrato mais recente deve voltar a ser um com
-- reconhecidas > 0 (o que estava valendo antes da colagem torta).
SELECT
  s.id,
  s.referencia,
  s.informado_em,
  s.total,
  count(l.id)                                                        AS linhas,
  count(l.id) FILTER (WHERE l.grupo_codigo IS NOT NULL
                         OR l.detalhamento_codigo IS NOT NULL)        AS reconhecidas
FROM informakon_saldo_snapshots s
LEFT JOIN informakon_saldo_linhas l ON l.snapshot_id = s.id
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
GROUP BY s.id, s.referencia, s.informado_em, s.total
ORDER BY s.referencia DESC, s.informado_em DESC;
