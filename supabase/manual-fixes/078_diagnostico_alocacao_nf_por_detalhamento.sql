-- ---------------------------------------------------------------------------
-- 078 — Diagnóstico: NF alocada por DETALHAMENTO x desconto por MACRO ITEM
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição 004: a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8
--
-- SOMENTE LEITURA. Nenhum bloco altera dados. Cada bloco é autossuficiente
-- (repete os CTEs que precisa) porque o SQL Editor do Supabase abre uma
-- sessão nova a cada execução — não dá pra usar TEMP TABLE entre blocos.
--
-- Contexto: o FIP-WAVE desconta NF de material por DETALHAMENTO (nível 4 da
-- WBS): desconto = MIN(material_medido_do_detalhamento, nf_disponivel_nele).
-- O Informakon (ERP da FIP) desconta por MACRO ITEM (nível 1, um balde bem
-- maior). Se a NF foi alocada no detalhamento A mas o que foi medido foi o
-- detalhamento B do MESMO grupo macro, o Informakon já considera abatido e
-- o FIP-WAVE não — sobra "material medido sem NF" (gap) num detalhamento e
-- "NF ociosa" (sobra) em outro, dentro do mesmo grupo. Rodar bloco a bloco.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- ATENCAO — ESTE SCRIPT DESCREVE A REGRA ANTIGA (28/07/2026)
--
-- Foi escrito para diagnosticar o desconto apurado POR DETALHAMENTO. Desde
-- entao a regra mudou: o saldo passou a ser apurado por GRUPO MACRO e
-- distribuido entre os itens medidos (lib/db/desconto-transbordo.ts). Os
-- numeros aqui nao correspondem mais ao que a tela mostra.
--
-- Mantido como registro do diagnostico que motivou a mudanca.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- F1 — Gap por detalhamento na medição 004
--
-- Reproduz fielmente lib/db/informacon-data.ts (calcularInformaconData):
--   nf_alocada_detalhamento = NF do fornecedor rateada pro-rata pelo
--     valor_total de cada item da solicitação aprovada (mesma fórmula da
--     migration 074 / função carregarNfJaAbatida + nfAlocadaPorDet).
--   nf_ja_abatida = SOMA de medicao_itens.nf_material_descontada nas
--     medições APROVADAS anteriores a esta (saldo corrido — cada NF só
--     desconta uma vez).
--   nf_disponivel = GREATEST(nf_alocada_detalhamento - nf_ja_abatida, 0)
--   desconto_possivel = LEAST(material_medido, nf_disponivel)
--   gap = GREATEST(material_medido - desconto_possivel, 0)
--
-- Como ler: ordenado por gap decrescente.
--
-- O SUM(gap) NÃO é o "FIP a criar" da tela. O rodapé quebra o gap em duas
-- linhas, e o que aparece como "FIP a criar" é só a segunda:
--
--   gap_material  = material medido − NF descontável
--   "Saldo Ped. Aprovados (NF Pendentes)" = min(gap, saldo de pedido aprovado)
--   "FIP a criar (NF nova)"               = gap − saldo acima
--
-- Na medição 004 em 28/07/2026 o rodapé mostrava 5.550,56 de saldo e
-- 50.627,70 de FIP a criar, então o SUM(gap) aqui deve dar ~R$ 56.178,26.
-- Se der 50.627,70, é porque o saldo de pedidos aprovados zerou desde então.
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf_alocada
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)      AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)             AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
nf_abatida AS (
  SELECT mi.detalhamento_id,
         SUM(mi.nf_material_descontada) AS nf_ja_abatida
    FROM medicao_itens mi
    JOIN medicoes m ON m.id = mi.medicao_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
     AND m.id <> 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   GROUP BY mi.detalhamento_id
)
SELECT
  d.codigo                                              AS codigo_detalhamento,
  d.descricao                                           AS nome_detalhamento,
  g.codigo                                              AS codigo_grupo_macro,
  g.nome                                                AS nome_grupo_macro,
  ROUND(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0), 2)
                                                         AS material_medido,
  ROUND(COALESCE(na.nf_alocada, 0), 2)                  AS nf_alocada_detalhamento,
  ROUND(COALESCE(nab.nf_ja_abatida, 0), 2)              AS nf_ja_abatida,
  ROUND(GREATEST(COALESCE(na.nf_alocada, 0) - COALESCE(nab.nf_ja_abatida, 0), 0), 2)
                                                         AS nf_disponivel,
  ROUND(LEAST(
    mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
    GREATEST(COALESCE(na.nf_alocada, 0) - COALESCE(nab.nf_ja_abatida, 0), 0)
  ), 2)                                                  AS desconto_possivel,
  ROUND(GREATEST(
    mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
    - LEAST(
        mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
        GREATEST(COALESCE(na.nf_alocada, 0) - COALESCE(nab.nf_ja_abatida, 0), 0)
      ), 0), 2)                                          AS gap
FROM medicao_itens mi
JOIN detalhamentos d ON d.id = mi.detalhamento_id
JOIN tarefas t        ON t.id = d.tarefa_id
JOIN grupos_macro g   ON g.id = t.grupo_macro_id
LEFT JOIN nf_alocada na  ON na.detalhamento_id = d.id
LEFT JOIN nf_abatida nab ON nab.detalhamento_id = d.id
WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
  AND mi.quantidade_medida > 0
ORDER BY gap DESC;


-- ---------------------------------------------------------------------------
-- F2 — NF ociosa por detalhamento
--
-- Detalhamentos em que a NF alocada (rateio pro-rata, mesma fórmula do F1)
-- é MAIOR que o material medido acumulado até hoje — ou seja, sobrou NF sem
-- material medido suficiente pra "gastar" ela.
--
-- material_medido_acumulado = SOMA de quantidade_medida * valor_material_unit
-- em todas as medições cujo status é 'aprovado' OU que sejam a própria
-- medição 004 (mesmo critério de "acumulado" usado em
-- calcularInformaconData: aprovadas + a medição corrente).
--
-- Como ler: ordenado por sobra decrescente. Cada linha aqui é candidata a
-- "doar" NF pra um gap do F1 no MESMO grupo macro (ver F3).
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf_alocada
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)      AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)             AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
material_acumulado AS (
  SELECT mi.detalhamento_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_acumulado
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY mi.detalhamento_id
)
SELECT
  d.codigo                                    AS codigo_detalhamento,
  d.descricao                                 AS nome_detalhamento,
  g.codigo                                    AS codigo_grupo_macro,
  g.nome                                      AS nome_grupo_macro,
  ROUND(na.nf_alocada, 2)                     AS nf_alocada_total,
  ROUND(COALESCE(ma.material_acumulado, 0), 2) AS material_medido_acumulado,
  ROUND(na.nf_alocada - COALESCE(ma.material_acumulado, 0), 2) AS sobra
FROM nf_alocada na
JOIN detalhamentos d  ON d.id = na.detalhamento_id
JOIN tarefas t        ON t.id = d.tarefa_id
JOIN grupos_macro g   ON g.id = t.grupo_macro_id
LEFT JOIN material_acumulado ma ON ma.detalhamento_id = na.detalhamento_id
WHERE na.nf_alocada > COALESCE(ma.material_acumulado, 0)
ORDER BY sobra DESC;


-- ---------------------------------------------------------------------------
-- F3 — Cruzamento por grupo macro: gap (F1) x sobra (F2)
--
-- Soma o gap da medição 004 (F1) e a sobra de NF ociosa (F2), lado a lado,
-- por GRUPO MACRO. Só aparecem grupos com gap e/ou sobra positivos.
--
-- Como ler:
--   gap_medicao_004 alto E nf_ociosa_sobra alto no MESMO grupo
--     -> forte indício de NF alocada no detalhamento errado dentro do
--        grupo. Resolvível remanejando itens_solicitacao_fat_direto.
--        detalhamento_id, sem lançar nota nova (ver F4).
--   só gap_medicao_004, sem nf_ociosa_sobra
--     -> não é erro de alocação: falta nota de verdade pra esse grupo.
--   indicio_remanejamento = LEAST(gap, sobra): quanto maior, mais forte o
--   indício (é o valor que, em tese, dá pra "resgatar" só remanejando).
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf_alocada
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)      AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)             AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
nf_abatida AS (
  SELECT mi.detalhamento_id,
         SUM(mi.nf_material_descontada) AS nf_ja_abatida
    FROM medicao_itens mi
    JOIN medicoes m ON m.id = mi.medicao_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
     AND m.id <> 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   GROUP BY mi.detalhamento_id
),
material_acumulado AS (
  SELECT mi.detalhamento_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_acumulado
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY mi.detalhamento_id
),
gap_det AS (
  SELECT t.grupo_macro_id,
         GREATEST(
           mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
           - LEAST(
               mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
               GREATEST(COALESCE(na.nf_alocada, 0) - COALESCE(nab.nf_ja_abatida, 0), 0)
             ), 0
         ) AS gap
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
    JOIN tarefas t       ON t.id = d.tarefa_id
    LEFT JOIN nf_alocada na  ON na.detalhamento_id = d.id
    LEFT JOIN nf_abatida nab ON nab.detalhamento_id = d.id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
     AND mi.quantidade_medida > 0
),
sobra_det AS (
  SELECT t.grupo_macro_id,
         GREATEST(na.nf_alocada - COALESCE(ma.material_acumulado, 0), 0) AS sobra
    FROM nf_alocada na
    JOIN detalhamentos d ON d.id = na.detalhamento_id
    JOIN tarefas t       ON t.id = d.tarefa_id
    LEFT JOIN material_acumulado ma ON ma.detalhamento_id = na.detalhamento_id
   WHERE na.nf_alocada > COALESCE(ma.material_acumulado, 0)
),
gap_grupo AS (
  SELECT grupo_macro_id, SUM(gap) AS gap_total FROM gap_det GROUP BY grupo_macro_id
),
sobra_grupo AS (
  SELECT grupo_macro_id, SUM(sobra) AS sobra_total FROM sobra_det GROUP BY grupo_macro_id
)
SELECT
  g.codigo                                                  AS codigo_grupo_macro,
  g.nome                                                    AS nome_grupo_macro,
  ROUND(COALESCE(gg.gap_total, 0), 2)                       AS gap_medicao_004,
  ROUND(COALESCE(sg.sobra_total, 0), 2)                     AS nf_ociosa_sobra,
  ROUND(LEAST(COALESCE(gg.gap_total, 0), COALESCE(sg.sobra_total, 0)), 2)
                                                             AS indicio_remanejamento
FROM grupos_macro g
LEFT JOIN gap_grupo gg   ON gg.grupo_macro_id = g.id
LEFT JOIN sobra_grupo sg ON sg.grupo_macro_id = g.id
WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND (COALESCE(gg.gap_total, 0) > 0 OR COALESCE(sg.sobra_total, 0) > 0)
ORDER BY indicio_remanejamento DESC, gap_medicao_004 DESC;


-- ---------------------------------------------------------------------------
-- F4 — Pedidos candidatos a remanejamento
--
-- Para os grupos macro em que F3 mostrou gap E sobra ao mesmo tempo
-- (indicio_remanejamento > 0), lista as solicitações aprovadas com seus
-- itens: id do item (pra um eventual UPDATE de detalhamento_id), o
-- detalhamento atual do item e o valor de NF da solicitação inteira.
--
-- Como usar: pra cada grupo, olhar F1 (qual detalhamento está com gap —
-- pra ONDE remanejar) e F2 (qual detalhamento está com sobra — DE ONDE
-- remanejar), depois localizar aqui o item da solicitação cujo
-- detalhamento_id_atual é o que está com sobra, e mudar pra o que está com
-- gap. UPDATE manual, item a item — este bloco só lista, não altera nada.
-- ---------------------------------------------------------------------------
WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf_alocada
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)      AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)             AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
nf_abatida AS (
  SELECT mi.detalhamento_id,
         SUM(mi.nf_material_descontada) AS nf_ja_abatida
    FROM medicao_itens mi
    JOIN medicoes m ON m.id = mi.medicao_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
     AND m.id <> 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
   GROUP BY mi.detalhamento_id
),
material_acumulado AS (
  SELECT mi.detalhamento_id,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_acumulado
    FROM medicao_itens mi
    JOIN medicoes m      ON m.id = mi.medicao_id
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND (m.status = 'aprovado' OR m.id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8')
   GROUP BY mi.detalhamento_id
),
gap_det AS (
  SELECT t.grupo_macro_id,
         GREATEST(
           mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)
           - LEAST(
               mi.quantidade_medida * COALESCE(d.valor_material_unit, 0),
               GREATEST(COALESCE(na.nf_alocada, 0) - COALESCE(nab.nf_ja_abatida, 0), 0)
             ), 0
         ) AS gap
    FROM medicao_itens mi
    JOIN detalhamentos d ON d.id = mi.detalhamento_id
    JOIN tarefas t       ON t.id = d.tarefa_id
    LEFT JOIN nf_alocada na  ON na.detalhamento_id = d.id
    LEFT JOIN nf_abatida nab ON nab.detalhamento_id = d.id
   WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
     AND mi.quantidade_medida > 0
),
sobra_det AS (
  SELECT t.grupo_macro_id,
         GREATEST(na.nf_alocada - COALESCE(ma.material_acumulado, 0), 0) AS sobra
    FROM nf_alocada na
    JOIN detalhamentos d ON d.id = na.detalhamento_id
    JOIN tarefas t       ON t.id = d.tarefa_id
    LEFT JOIN material_acumulado ma ON ma.detalhamento_id = na.detalhamento_id
   WHERE na.nf_alocada > COALESCE(ma.material_acumulado, 0)
),
gap_grupo AS (
  SELECT grupo_macro_id, SUM(gap) AS gap_total FROM gap_det GROUP BY grupo_macro_id
),
sobra_grupo AS (
  SELECT grupo_macro_id, SUM(sobra) AS sobra_total FROM sobra_det GROUP BY grupo_macro_id
),
grupos_candidatos AS (
  SELECT gg.grupo_macro_id
    FROM gap_grupo gg
    JOIN sobra_grupo sg ON sg.grupo_macro_id = gg.grupo_macro_id
   WHERE gg.gap_total > 0
     AND sg.sobra_total > 0
)
SELECT
  g.codigo                            AS codigo_grupo_macro,
  g.nome                              AS nome_grupo_macro,
  s.numero                            AS numero_solicitacao,
  s.id                                AS solicitacao_id,
  i.id                                AS item_solicitacao_id,
  i.detalhamento_id                   AS detalhamento_atual_id,
  d.codigo                            AS codigo_detalhamento_atual,
  d.descricao                         AS descricao_detalhamento_atual,
  ROUND(i.valor_total, 2)             AS valor_total_item,
  ROUND(nf_sol.total_nf, 2)           AS nf_total_solicitacao
FROM itens_solicitacao_fat_direto i
JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
JOIN detalhamentos d ON d.id = i.detalhamento_id
JOIN tarefas t        ON t.id = d.tarefa_id
JOIN grupos_macro g   ON g.id = t.grupo_macro_id
JOIN LATERAL (
  SELECT COALESCE(SUM(nf.valor), 0) AS total_nf
    FROM notas_fiscais_fat_direto nf
   WHERE nf.solicitacao_id = s.id
) nf_sol ON TRUE
WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND s.status = 'aprovado'
  AND s.deletado_em IS NULL
  AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
  AND t.grupo_macro_id IN (SELECT grupo_macro_id FROM grupos_candidatos)
ORDER BY g.codigo, s.numero, d.codigo;
