-- ---------------------------------------------------------------------------
-- 084 — Comparando pela base certa: NF descontada (nossa) x Material
-- Fornecido (FIP), grupo a grupo, ao longo de MED-001 a MED-004
--
-- SOMENTE LEITURA. Nada é alterado.
--
-- CORREÇÃO DE ENTENDIMENTO: o script 083 comparou "material medido" (bruto,
-- executado fisicamente) contra o "Material Fornecido" do espelho da FIP.
-- Isso estava errado. O espelho chama essa linha de "DESCONTO DE NOTAS
-- LANÇADAS NO SISTEMA" — é a NOTA FISCAL efetivamente descontada, o mesmo
-- conceito da nossa linha "NOTA FIP Material (já descontada)"
-- (nf_descontavel), não o material bruto. Quando a nota ainda não cobre tudo
-- o que foi executado, a dedução da FIP fica MENOR que o material medido —
-- exatamente o gap que a régua acumulada por grupo já resolve do nosso lado.
--
-- Prova: nos grupos 7 e 8 das medições 1 e 2, nosso material bruto era maior
-- que o "Material Fornecido" da FIP na mesma direção e proporção do gap de
-- Geração já identificado na medição 004 — nota insuficiente, não erro de
-- rateio.
--
-- Este script reproduz a régua acumulada (mesma regra de
-- lib/db/desconto-transbordo.ts) por GRUPO MACRO, medição a medição de 1 a 4,
-- usando janela (running total) em vez de recursão — e compara o desconto do
-- PERÍODO de cada medição contra o "Material Fornecido" que a FIP informou.
--
-- LIMITAÇÃO CONHECIDA: `nf_lancada` usa o ledger de NF de HOJE (todas as
-- solicitações aprovadas do contrato, sem recorte por data), não o que
-- existia no momento de cada medição histórica — mesma limitação de todos os
-- diagnósticos anteriores desta sessão (076 a 082), porque não há snapshot
-- por data do ledger de pedidos/NF. Pode inflar o desconto de períodos
-- antigos com NF emitida meses depois. Serve pra apontar a ORDEM DE GRANDEZA
-- da diferença, não pra um fechamento contábil exato de MED-001/002.
--
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- ---------------------------------------------------------------------------

WITH nf_alocada AS (
  SELECT i.detalhamento_id,
         SUM(i.valor_total / NULLIF(tot.total_sol, 0) * tot.total_nf) AS nf
    FROM itens_solicitacao_fat_direto i
    JOIN solicitacoes_fat_direto s ON s.id = i.solicitacao_id
    JOIN LATERAL (
      SELECT (SELECT COALESCE(SUM(i2.valor_total), 0)
                FROM itens_solicitacao_fat_direto i2
               WHERE i2.solicitacao_id = s.id
                 AND i2.detalhamento_id IS NOT NULL)  AS total_sol,
             (SELECT COALESCE(SUM(nf.valor), 0)
                FROM notas_fiscais_fat_direto nf
               WHERE nf.solicitacao_id = s.id)        AS total_nf
    ) tot ON TRUE
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND s.status = 'aprovado'
     AND s.deletado_em IS NULL
     AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico'
     AND i.detalhamento_id IS NOT NULL
   GROUP BY i.detalhamento_id
),
material_por_medicao AS (
  SELECT m.numero,
         g.codigo AS grupo,
         SUM(mi.quantidade_medida * COALESCE(d.valor_material_unit, 0)) AS material_periodo
    FROM medicoes m
    JOIN medicao_itens mi  ON mi.medicao_id = m.id
    JOIN detalhamentos d   ON d.id = mi.detalhamento_id
    JOIN tarefas t         ON t.id = d.tarefa_id
    JOIN grupos_macro g    ON g.id = t.grupo_macro_id
   WHERE m.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND m.status = 'aprovado'
     AND m.numero BETWEEN 1 AND 4
   GROUP BY m.numero, g.codigo
),
nf_por_grupo AS (
  SELECT g.codigo AS grupo,
         SUM(COALESCE(n.nf, 0)) AS nf_lancada
    FROM grupos_macro g
    JOIN tarefas t ON t.grupo_macro_id = g.id
    JOIN detalhamentos d ON d.tarefa_id = t.id
    LEFT JOIN nf_alocada n ON n.detalhamento_id = d.id
   WHERE g.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   GROUP BY g.codigo
),
regua AS (
  SELECT mp.numero, mp.grupo, mp.material_periodo, npg.nf_lancada,
         SUM(mp.material_periodo) OVER (
           PARTITION BY mp.grupo ORDER BY mp.numero
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS material_acumulado_ate_aqui
    FROM material_por_medicao mp
    JOIN nf_por_grupo npg ON npg.grupo = mp.grupo
),
com_desconto AS (
  SELECT numero, grupo, material_periodo, nf_lancada, material_acumulado_ate_aqui,
         LEAST(material_acumulado_ate_aqui, nf_lancada) AS desconto_acumulado_ate_aqui,
         LEAST(material_acumulado_ate_aqui, nf_lancada)
           - COALESCE(LAG(LEAST(material_acumulado_ate_aqui, nf_lancada)) OVER (
               PARTITION BY grupo ORDER BY numero
             ), 0) AS desconto_do_periodo_nosso
    FROM regua
),
fip AS (
  -- Material Fornecido (= NF descontada) por grupo, do detalhe de NF que o
  -- usuário colou no chat em 28/07/2026.
  SELECT * FROM (VALUES
    (1, '1',    5261.84), (1, '2',   19367.62), (1, '4',    1591.77),
    (1, '7',    1060.07), (1, '8',  22805.10),  (1, '9',   26159.32),
    (1, '18',  46237.69), (1, '19', 76000.00),
    (2, '3',    5155.52), (2, '4',    2706.00), (2, '8',    1249.50),
    (2, '9',    6539.83), (2, '10', 28253.70),  (2, '18',   3693.55),
    (2, '19',  49934.70)
  ) AS t(numero, grupo, material_fornecido_fip)
)
SELECT c.numero, c.grupo,
       ROUND(c.material_periodo, 2)             AS material_medido_bruto,
       ROUND(c.desconto_do_periodo_nosso, 2)     AS nf_descontada_nossa,
       ROUND(fip.material_fornecido_fip, 2)      AS material_fornecido_fip,
       ROUND(c.desconto_do_periodo_nosso - fip.material_fornecido_fip, 2) AS diferenca
  FROM com_desconto c
  JOIN fip ON fip.numero = c.numero AND fip.grupo = c.grupo
 WHERE c.numero IN (1, 2)
 ORDER BY c.numero, ABS(c.desconto_do_periodo_nosso - fip.material_fornecido_fip) DESC;


-- ---------------------------------------------------------------------------
-- CONCLUSÃO (rodado em 28/07/2026, resultado registrado aqui pra referência
-- futura — nada neste bloco é executável, é só documentação do achado):
--
-- Com o ledger de NF de HOJE, `nf_descontada_nossa` bateu EXATAMENTE com
-- `material_medido_bruto` nos grupos 7 e 8 (MED-001/002) — ou seja, a régua
-- acumulada não precisou capar nada: há nota de sobra hoje cobrindo 100% do
-- material. Isso confirma que a nota que faltava em março/maio de 2026 (a
-- diferença que a FIP mostrou como "Material Fornecido" menor que o
-- executado) FOI EMITIDA DEPOIS — a régua, rodada com dados de hoje,
-- reconhece essa cobertura.
--
-- DECISÃO: não mexer em MED-001 e MED-002. Elas já foram aprovadas e pagas
-- pelo SERVIÇO (líquido = serviço medido − retenção), que nunca dependeu do
-- material ter nota ou não. A pequena diferença de líquido contra a FIP
-- (R$ 58,69 na MED-001, R$ 302,46 na MED-002) vem de uma escolha de design
-- proposital e já documentada no código: a base de retenção soma TODO
-- material executado fisicamente, não só o que já tem nota — mais
-- conservador pra Wave, garante a retenção mesmo antes da nota chegar
-- (ver comentário "Base de retenção" em lib/db/informacon-data.ts).
--
-- Isso reabriu a pergunta sobre a MED-004: o ajuste_material_anterior de
-- R$ 3.909,77 aplicado nela comparou material bruto (nosso) contra a nota
-- descontada (FIP) — base diferente da usada aqui. A comparação certa
-- (nota nossa, já com régua acumulada, x nota da FIP) fica em R$ 768,53, não
-- R$ 3.909,77 — uma diferença de R$ 3.141,24 no líquido já emitido.
--
-- DECISÃO (usuário, 28/07/2026): manter o ajuste de R$ 3.909,77 como está.
-- A NF da MED-004 já foi emitida e entregue em R$ 340.631,06; não reabrir
-- esse valor. Fica registrado aqui para o caso de a questão voltar no
-- futuro (ex.: se a NF ainda não tiver sido paga/confirmada pela FIP e
-- alguém quiser reconsiderar).
-- ---------------------------------------------------------------------------
