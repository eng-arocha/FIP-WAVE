-- ---------------------------------------------------------------------------
-- 079 — Diagnóstico: rateio material x serviço (FIP-WAVE) vs rateio do
-- Informakon (ERP da FIP), por grupo macro
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Medição 004: a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8
--
-- SOMENTE LEITURA. Nenhum bloco altera dados. Cada bloco é autossuficiente
-- (repete os CTEs que precisa) porque o SQL Editor do Supabase abre uma
-- sessão nova a cada execução — não dá pra usar TEMP TABLE entre blocos.
--
-- Contexto: o contrato divide cada detalhamento (nível 4 da WBS) em
-- valor_material_unit e valor_servico_unit. Medir X% de um item significa
-- medir X% do material e X% do serviço desse item — esse é o rateio
-- "contratado" do FIP-WAVE. O Informakon tem o SEU próprio rateio
-- material/serviço (calculado por ele, fora do FIP-WAVE), e diverge do
-- nosso. Na medição 004 o TOTAL medido bate quase exato entre os dois
-- sistemas (R$ 2,40 de diferença, arredondamento), mas a DIVISÃO
-- material/serviço diverge bastante, obrigando hoje um ajuste manual de
-- R$ 3.909,77 no rodapé da medição. Este arquivo investiga onde o rateio
-- diverge e simula uma correção que elimina o ajuste manual na origem,
-- sem mudar o total do contrato nem o total medido de cada item.
--
-- IMPORTANTE — mapeamento do grupo "19.1.1": os dados fornecidos pelo
-- usuário citam o grupo "19.1.1", mas esse é o código de um DETALHAMENTO
-- (nível 4), não de um grupo macro. O grupo macro correspondente tem
-- codigo = '19' (SERVIÇOS COMPLEMENTARES). Na medição 004, aparentemente
-- só o detalhamento 19.1.1 desse grupo foi medido, por isso o total do
-- grupo bate com o valor citado para "19.1.1". Nos blocos abaixo, o valor
-- informado para "19.1.1" foi embutido sob a chave de grupo '19'.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- G1 — Rateio CONTRATADO material/serviço por grupo macro
--
-- Para cada grupo macro do contrato: soma de quantidade_contratada *
-- valor_material_unit e quantidade_contratada * valor_servico_unit de TODOS
-- os detalhamentos do grupo (independente de terem sido medidos ou não),
-- o total contratado, e o percentual de material sobre o total.
--
-- Como ler: é o rateio "de origem" do FIP-WAVE, o que o orçamento contratual
-- diz que é material vs serviço em cada grupo. Serve de referência pros
-- blocos seguintes, que comparam isso com o que foi MEDIDO e com o que o
-- Informakon considerou.
-- Ordenado por g.ordem (não por g.codigo, que é TEXT e não ordena
-- numericamente de forma confiável).
-- ---------------------------------------------------------------------------
SELECT
  g.codigo                                                        AS codigo_grupo,
  g.nome                                                          AS nome_grupo,
  ROUND(SUM(d.quantidade_contratada * d.valor_material_unit), 2)  AS material_contratado,
  ROUND(SUM(d.quantidade_contratada * d.valor_servico_unit), 2)   AS servico_contratado,
  ROUND(
    SUM(d.quantidade_contratada * d.valor_material_unit)
    + SUM(d.quantidade_contratada * d.valor_servico_unit)
  , 2)                                                             AS total_contratado,
  ROUND(
    100.0 * SUM(d.quantidade_contratada * d.valor_material_unit)
    / NULLIF(
        SUM(d.quantidade_contratada * d.valor_material_unit)
        + SUM(d.quantidade_contratada * d.valor_servico_unit)
      , 0)
  , 4)                                                             AS percentual_material
FROM detalhamentos d
JOIN tarefas t      ON t.id = d.tarefa_id
JOIN grupos_macro g ON g.id = t.grupo_macro_id
WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
GROUP BY g.id, g.codigo, g.nome, g.ordem
ORDER BY g.ordem;


-- ---------------------------------------------------------------------------
-- G2 — O que a medição 004 MEDIU, por grupo, comparado ao rateio do Informakon
--
-- Para cada grupo macro: material medido, serviço medido, total medido e o
-- percentual de material sobre o total medido na medição 004 — esse é o
-- rateio que o FIP-WAVE está aplicando na prática, item medido a item
-- medido. Ao lado, o material que o Informakon considerou pra esse mesmo
-- grupo (valores fornecidos pelo usuário, bloco C4 já rodado no ERP,
-- embutidos aqui como VALUES) e a diferença (Informakon − FIP-WAVE).
--
-- material_informakon é NULL para grupos que não foram fornecidos na lista
-- (não presumimos zero — sem o dado do Informakon, não dá pra comparar).
--
-- Como ler: ordenado por |diferença| decrescente — os primeiros da lista
-- são os grupos que mais empurram o ajuste manual do rodapé. Os 4 do topo
-- devem ser 4, 2, 6 e 14 (os mesmos do G3/G4 abaixo).
-- ---------------------------------------------------------------------------
WITH informakon_grupo (codigo_grupo, material_informakon) AS (
  VALUES
    ('19', 76000.00),   -- citado como "19.1.1" pelo usuário, ver nota no topo
    ('3',  71054.98),
    ('14', 56841.77),
    ('10', 51751.52),
    ('4',  29938.30),
    ('8',  26831.54),
    ('9',  24242.07),
    ('7',  21563.25),
    ('2',  16680.42),
    ('18', 14393.96),
    ('1',  13234.47),
    ('6',  13193.12),
    ('16', 6979.66),
    ('17', 1907.97)
),
medido_grupo AS (
  SELECT
    g.id                                                        AS grupo_id,
    g.codigo                                                    AS codigo_grupo,
    g.nome                                                      AS nome_grupo,
    SUM(mi.quantidade_medida * d.valor_material_unit)           AS material_medido,
    SUM(mi.quantidade_medida * d.valor_servico_unit)            AS servico_medido
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN tarefas t        ON t.id = d.tarefa_id
  JOIN grupos_macro g   ON g.id = t.grupo_macro_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
    AND mi.quantidade_medida > 0
  GROUP BY g.id, g.codigo, g.nome
)
SELECT
  mg.codigo_grupo,
  mg.nome_grupo,
  ROUND(mg.material_medido, 2)                                   AS material_medido_fipwave,
  ROUND(mg.servico_medido, 2)                                    AS servico_medido_fipwave,
  ROUND(mg.material_medido + mg.servico_medido, 2)               AS total_medido,
  ROUND(
    100.0 * mg.material_medido
    / NULLIF(mg.material_medido + mg.servico_medido, 0)
  , 4)                                                            AS percentual_material_medido,
  ROUND(ig.material_informakon, 2)                               AS material_informakon,
  ROUND(ig.material_informakon - mg.material_medido, 2)          AS diferenca_informakon_menos_fipwave
FROM medido_grupo mg
LEFT JOIN informakon_grupo ig ON ig.codigo_grupo = mg.codigo_grupo
ORDER BY ABS(ig.material_informakon - mg.material_medido) DESC NULLS LAST;


-- ---------------------------------------------------------------------------
-- G3 — Fator de correção para os 4 grupos mais divergentes (14, 4, 6, 2)
--
-- Para cada detalhamento MEDIDO na 004 (quantidade_medida > 0) desses 4
-- grupos, calcula o valor_material_unit "proposto" que, aplicado, faz o
-- material medido do grupo bater com o valor do Informakon — mantendo
-- valor_material_unit + valor_servico_unit = valor_unitario intacto (o
-- total do contrato e o total de cada item medido NÃO mudam, só a
-- fronteira entre material e serviço dentro do item).
--
-- fator_correcao = material_informakon_grupo / material_fipwave_grupo
--   (material_fipwave_grupo = material medido do grupo na 004, igual ao
--    calculado no G2)
-- material_unit_proposto  = valor_material_unit atual * fator_correcao
-- servico_unit_proposto   = valor_unitario − material_unit_proposto
--
-- Como o fator é aplicado uniformemente a valor_material_unit (não à
-- quantidade), o mesmo fator vale pra qualquer quantidade medida — inclusive
-- pra medições futuras/anteriores do mesmo detalhamento (usado no G4).
--
-- Inclui d.id (detalhamento_id) — necessário para um eventual UPDATE
-- manual de valor_material_unit / valor_servico_unit.
-- ---------------------------------------------------------------------------
WITH informakon_grupo (codigo_grupo, material_informakon) AS (
  VALUES
    ('14', 56841.77),
    ('4',  29938.30),
    ('6',  13193.12),
    ('2',  16680.42)
),
material_grupo_004 AS (
  SELECT
    g.codigo                                          AS codigo_grupo,
    SUM(mi.quantidade_medida * d.valor_material_unit) AS material_fipwave
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN tarefas t        ON t.id = d.tarefa_id
  JOIN grupos_macro g   ON g.id = t.grupo_macro_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
    AND mi.quantidade_medida > 0
    AND g.codigo IN ('14', '4', '6', '2')
  GROUP BY g.codigo
),
fator_grupo AS (
  SELECT
    mg.codigo_grupo,
    mg.material_fipwave,
    ig.material_informakon,
    ig.material_informakon / NULLIF(mg.material_fipwave, 0) AS fator_correcao
  FROM material_grupo_004 mg
  JOIN informakon_grupo ig ON ig.codigo_grupo = mg.codigo_grupo
)
SELECT
  g.codigo                                                       AS codigo_grupo,
  d.id                                                            AS detalhamento_id,
  d.codigo                                                        AS codigo_detalhamento,
  d.descricao                                                     AS nome_detalhamento,
  ROUND(fg.fator_correcao, 4)                                     AS fator_correcao,
  ROUND(d.valor_unitario, 4)                                      AS valor_unitario,
  ROUND(d.valor_material_unit, 4)                                 AS material_unit_atual,
  ROUND(d.valor_material_unit * fg.fator_correcao, 4)             AS material_unit_proposto,
  ROUND(d.valor_servico_unit, 4)                                  AS servico_unit_atual,
  ROUND(
    d.valor_unitario - (d.valor_material_unit * fg.fator_correcao)
  , 4)                                                             AS servico_unit_proposto
FROM medicao_itens mi
JOIN detalhamentos d ON d.id = mi.detalhamento_id
JOIN tarefas t        ON t.id = d.tarefa_id
JOIN grupos_macro g   ON g.id = t.grupo_macro_id
JOIN fator_grupo fg   ON fg.codigo_grupo = g.codigo
WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
  AND mi.quantidade_medida > 0
ORDER BY g.codigo, d.codigo;


-- ---------------------------------------------------------------------------
-- G4 — Impacto retroativo nas medições 1 a 4 (todas do contrato)
--
-- Para cada medição (numero 1 a 4), mostra material medido, serviço medido
-- e total pelo rateio ATUAL, e o mesmo recalculado aplicando o
-- fator_correcao do G3 aos detalhamentos dos grupos 14, 4, 6 e 2 (os
-- demais grupos entram sem alteração, fator = 1). O total de cada item
-- medido não muda — só a divisão material/serviço dentro dele.
--
-- Como ler: "delta_material" é quanto o material medido daquela medição
-- mudaria se o acerto de rateio fosse aplicado retroativamente. É pra dar
-- visibilidade ao usuário antes de decidir aplicar o UPDATE do G3 — não é
-- uma proposta de reabrir medições aprovadas.
--
-- ATENÇÃO / RISCO: medicao_itens.nf_material_descontada das medições já
-- APROVADAS é um SNAPSHOT gravado no momento da aprovação e NÃO muda com
-- este recálculo (não é recalculado aqui nem por um eventual UPDATE em
-- detalhamentos). O que muda é o material/serviço MEDIDO exibido no
-- boletim (valor "vivo", calculado a partir de detalhamentos), inclusive
-- retroativamente nas medições 1-3 já aprovadas — só o rodapé histórico
-- exibido muda, o valor de NF já descontado permanece o gravado.
-- ---------------------------------------------------------------------------
WITH informakon_grupo (codigo_grupo, material_informakon) AS (
  VALUES
    ('14', 56841.77),
    ('4',  29938.30),
    ('6',  13193.12),
    ('2',  16680.42)
),
material_grupo_004 AS (
  SELECT
    g.codigo                                          AS codigo_grupo,
    SUM(mi.quantidade_medida * d.valor_material_unit) AS material_fipwave
  FROM medicao_itens mi
  JOIN detalhamentos d ON d.id = mi.detalhamento_id
  JOIN tarefas t        ON t.id = d.tarefa_id
  JOIN grupos_macro g   ON g.id = t.grupo_macro_id
  WHERE mi.medicao_id = 'a4ddbd6d-2862-4f85-b5c7-e03560b8cdf8'
    AND mi.quantidade_medida > 0
    AND g.codigo IN ('14', '4', '6', '2')
  GROUP BY g.codigo
),
fator_grupo AS (
  SELECT
    mg.codigo_grupo,
    ig.material_informakon / NULLIF(mg.material_fipwave, 0) AS fator_correcao
  FROM material_grupo_004 mg
  JOIN informakon_grupo ig ON ig.codigo_grupo = mg.codigo_grupo
),
itens AS (
  SELECT
    m.numero                                                     AS numero_medicao,
    mi.quantidade_medida * d.valor_material_unit                 AS material_atual,
    mi.quantidade_medida * d.valor_servico_unit                  AS servico_atual,
    mi.quantidade_medida * d.valor_material_unit
      * COALESCE(fg.fator_correcao, 1)                           AS material_proposto,
    -- servico_proposto absorve o inverso do ajuste de material, pra manter
    -- o total do item (material + servico) sempre igual ao atual:
    mi.quantidade_medida * d.valor_servico_unit
      + mi.quantidade_medida * d.valor_material_unit
        * (1 - COALESCE(fg.fator_correcao, 1))                   AS servico_proposto
  FROM medicao_itens mi
  JOIN medicoes m       ON m.id = mi.medicao_id
  JOIN detalhamentos d  ON d.id = mi.detalhamento_id
  JOIN tarefas t         ON t.id = d.tarefa_id
  JOIN grupos_macro g    ON g.id = t.grupo_macro_id
  LEFT JOIN fator_grupo fg ON fg.codigo_grupo = g.codigo
  WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND m.numero BETWEEN 1 AND 4
    AND mi.quantidade_medida > 0
)
SELECT
  numero_medicao,
  ROUND(SUM(material_atual), 2)                                  AS material_medido_atual,
  ROUND(SUM(servico_atual), 2)                                   AS servico_medido_atual,
  ROUND(SUM(material_atual) + SUM(servico_atual), 2)             AS total_medido_atual,
  ROUND(SUM(material_proposto), 2)                               AS material_medido_proposto,
  ROUND(SUM(servico_proposto), 2)                                AS servico_medido_proposto,
  ROUND(SUM(material_proposto) + SUM(servico_proposto), 2)       AS total_medido_proposto,
  ROUND(SUM(material_proposto) - SUM(material_atual), 2)         AS delta_material
FROM itens
GROUP BY numero_medicao
ORDER BY numero_medicao;


-- ---------------------------------------------------------------------------
-- RISCO — leia antes de aplicar qualquer UPDATE baseado no G3
--
-- valor_material_unit e valor_servico_unit em `detalhamentos` são usados
-- por TODAS as medições (aprovadas ou não) que já mediram aquele
-- detalhamento — não é um valor "por medição". Alterar esses campos muda
-- retroativamente o material/serviço MEDIDO exibido em TODAS as medições
-- que tocam esses detalhamentos, inclusive as já aprovadas (medições 1 a
-- 3), como mostrado no G4.
--
-- O total do CONTRATO (quantidade_contratada * valor_unitario por
-- detalhamento) e o total de cada item MEDIDO (quantidade_medida *
-- valor_unitario) não mudam, porque valor_material_unit + valor_servico_unit
-- continua igual a valor_unitario — só a fronteira interna muda. Ainda
-- assim, o rodapé HISTÓRICO (material vs serviço) das medições já
-- aprovadas mudaria visualmente, e medicao_itens.nf_material_descontada
-- (snapshot gravado na aprovação) NÃO seria recalculado automaticamente —
-- ficaria descasado do novo material medido "vivo" até que alguém decida
-- (fora deste diagnóstico) se isso deve ser corrigido também.
-- ---------------------------------------------------------------------------
