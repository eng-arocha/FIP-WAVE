-- ============================================================================
-- 077 — Regularização das NFs faltantes do 19.1.1 + correções de digitação
--
-- Baseado na conciliação do relatório Informakon de 28/07/2026 (bloco C2/C3
-- do script 076). Duas coisas independentes:
--
--   E1) Quatro lançamentos com número ou valor digitado errado no FIP-WAVE.
--       Não falta nota — falta corrigir o que já está lá.
--
--   E2) O mês de julho da ADMINISTRAÇÃO DE OBRA nunca foi lançado, mais uma
--       nota de refeições de junho. Somam exatamente os R$ 44.384,90 que o
--       bloco C3 aponta como faltando no grupo 19.1.1.
--
-- O padrão da administração de obra é R$ 38.000/mês, sempre em 3 notas:
--   J Mauricio 16.000 + Marcelo Silveira 13.500 + Antonio Gibson 8.500.
-- Os meses de março a junho já estão no sistema; julho não.
--
-- Rode bloco a bloco, na ordem. E0 é só leitura.
-- Contrato: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
-- Detalhamento 19.1.1: da866f02-fc19-a1ef-c99a-391bc906aa30 (tarefa 19.1)
-- ============================================================================


-- ============================================================================
-- E0 — DIAGNÓSTICO (somente leitura). Rode antes de tudo.
-- Mostra os pedidos que já existem no 19.1.1 e as notas lançadas em cada um.
-- Serve pra confirmar que julho realmente não está lá antes de inserir.
-- ============================================================================
SELECT s.id                AS solicitacao_id,
       s.numero            AS pedido,
       s.status,
       s.fornecedor_razao_social,
       s.valor_total       AS valor_pedido,
       nf.numero_nf,
       nf.emitente,
       nf.valor            AS valor_nf,
       nf.data_emissao,
       nf.status           AS status_nf
  FROM solicitacoes_fat_direto s
  JOIN itens_solicitacao_fat_direto i ON i.solicitacao_id = s.id
  LEFT JOIN notas_fiscais_fat_direto nf ON nf.solicitacao_id = s.id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.deletado_em IS NULL
   AND i.detalhamento_id = 'da866f02-fc19-a1ef-c99a-391bc906aa30'
 ORDER BY nf.data_emissao NULLS LAST, s.numero;


-- ============================================================================
-- E1 — CORREÇÕES DE DIGITAÇÃO
--
-- Transacional: ou entra tudo, ou nada. Cada UPDATE tem RETURNING pra você
-- conferir o que mudou antes do COMMIT.
-- ============================================================================
BEGIN;

-- 1) M. A. Frota: o número foi digitado 232990; a nota é 232900.
--    O valor (35.084,13) já está correto.
UPDATE notas_fiscais_fat_direto nf
   SET numero_nf = '232900'
  FROM solicitacoes_fat_direto s
 WHERE s.id = nf.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') = '232990'
RETURNING nf.id, nf.numero_nf, nf.emitente, nf.valor;

-- 2) Fort Seal NF 3040: 13.433,75 -> 13.443,75 (dígito trocado).
UPDATE notas_fiscais_fat_direto nf
   SET valor = 13443.75
  FROM solicitacoes_fat_direto s
 WHERE s.id = nf.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') = '3040'
   AND nf.valor = 13433.75
RETURNING nf.id, nf.numero_nf, nf.emitente, nf.valor;

-- 3) Sv Comércio NF 531790: 1.930,28 -> 1.930,48.
UPDATE notas_fiscais_fat_direto nf
   SET valor = 1930.48
  FROM solicitacoes_fat_direto s
 WHERE s.id = nf.solicitacao_id
   AND s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') = '531790'
   AND nf.valor = 1930.28
RETURNING nf.id, nf.numero_nf, nf.emitente, nf.valor;

-- 4) Carmehil: os dois números de nota foram colados num campo só
--    ('2364291160772' = 236429 + 1160772), com o valor somado (13.852,20).
--    Separa em duas notas, no mesmo pedido.
WITH alvo AS (
  SELECT nf.id, nf.solicitacao_id, nf.emitente, nf.cnpj_emitente,
         nf.data_emissao, nf.status
    FROM notas_fiscais_fat_direto nf
    JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
   WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') = '2364291160772'
),
corrigida AS (
  UPDATE notas_fiscais_fat_direto nf
     SET numero_nf = '1160772',
         valor     = 13742.85,
         descricao = COALESCE(nf.descricao || ' | ', '')
                     || 'Corrigida em 28/07/2026: o campo continha 236429+1160772 somados.'
    FROM alvo
   WHERE nf.id = alvo.id
  RETURNING nf.id
)
INSERT INTO notas_fiscais_fat_direto
       (solicitacao_id, numero_nf, emitente, cnpj_emitente, valor, data_emissao, status, descricao)
SELECT alvo.solicitacao_id, '236429', alvo.emitente, alvo.cnpj_emitente,
       109.35, alvo.data_emissao, alvo.status,
       'Desmembrada em 28/07/2026 do lançamento 2364291160772 (conciliação Informakon).'
  FROM alvo
 WHERE EXISTS (SELECT 1 FROM corrigida)
RETURNING id, numero_nf, emitente, valor;

-- Confira os RETURNING acima. Se estiver certo:
COMMIT;
-- Se algo veio errado, rode: ROLLBACK;


-- ============================================================================
-- E2 — LANÇAR AS NFs FALTANTES DO 19.1.1 (R$ 44.384,90)
--
-- Cria um pedido de regularização por fornecedor, com um único item apontando
-- para o detalhamento 19.1.1 e valor igual ao da nota. Pedido dedicado, e não
-- anexo a um pedido existente, por dois motivos: o rateio da NF é pro-rata
-- entre os itens do pedido (num pedido dedicado vai 100% para o 19.1.1), e
-- anexar a um pedido antigo estouraria o saldo dele, disparando o fluxo de
-- divergência sem necessidade.
--
-- Idempotente: se a nota já existir no contrato (mesmo número e valor), o
-- pedido não é criado. Pode rodar duas vezes sem duplicar.
-- ============================================================================
BEGIN;

DO $$
DECLARE
  v_contrato   UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_det        UUID := 'da866f02-fc19-a1ef-c99a-391bc906aa30';  -- 19.1.1
  v_tarefa     UUID;
  v_sol        UUID;
  v_solicitante UUID;
  r            RECORD;
  v_criados    INT := 0;
  v_pulados    INT := 0;
BEGIN
  SELECT tarefa_id INTO v_tarefa FROM detalhamentos WHERE id = v_det;
  IF v_tarefa IS NULL THEN
    RAISE EXCEPTION 'Detalhamento 19.1.1 (%) não encontrado.', v_det;
  END IF;

  -- Solicitante: usa o perfil do responsável pela conciliação. Se não achar,
  -- deixa NULL (a coluna aceita) em vez de falhar a regularização inteira.
  SELECT id INTO v_solicitante FROM perfis WHERE email = 'eng.arocha@gmail.com' LIMIT 1;

  FOR r IN
    SELECT * FROM (VALUES
      -- número,  emitente,                                        valor,     emissão,      tipo doc
      ('90',   'J MAURICIO DE VASCONCELOS SOUZA',                  16000.00, DATE '2026-07-21', 'NFS-e'),
      ('93',   'MARCELO SILVEIRA DE SIQUEIRA SERVICOS DE ENGENHARIA', 13500.00, DATE '2026-07-20', 'NFS-e'),
      ('6',    '65.659.717 ANTONIO GIBSON FERREIRA DE LIMA',        8500.00, DATE '2026-07-20', 'NFS-e'),
      ('2144', 'RDA COMERCIO DE REFEICOES E ALIMENTOS LTDA',        6384.90, DATE '2026-06-03', 'NF-e')
    ) AS t(numero_nf, emitente, valor, data_emissao, tipo_doc)
  LOOP
    -- Guarda de idempotência: mesma nota (número + valor) já no contrato.
    IF EXISTS (
      SELECT 1
        FROM notas_fiscais_fat_direto nf
        JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
       WHERE s.contrato_id = v_contrato
         AND s.deletado_em IS NULL
         AND REGEXP_REPLACE(nf.numero_nf, '\D', '', 'g') = r.numero_nf
         AND nf.valor = r.valor
    ) THEN
      v_pulados := v_pulados + 1;
      RAISE NOTICE 'Já existe: % % de %  — pulando.', r.tipo_doc, r.numero_nf, r.emitente;
      CONTINUE;
    END IF;

    INSERT INTO solicitacoes_fat_direto
           (contrato_id, status, solicitante_id, aprovador_id, data_solicitacao,
            data_aprovacao, valor_total, fornecedor_razao_social, tipo, observacoes)
    VALUES (v_contrato, 'aprovado', v_solicitante, v_solicitante, r.data_emissao,
            r.data_emissao, r.valor, r.emitente, 'material_fornecedor',
            'Regularização 28/07/2026 — nota já lançada no Informakon e ausente no FIP-WAVE '
            || '(conciliação do relatório de 28/07/2026, item 19.1.1 ADMINISTRAÇÃO DE OBRA).')
    RETURNING id INTO v_sol;

    INSERT INTO itens_solicitacao_fat_direto
           (solicitacao_id, tarefa_id, detalhamento_id, descricao, local,
            qtde_solicitada, valor_unitario)
    VALUES (v_sol, v_tarefa, v_det, 'ADMINISTRAÇÃO OBRA ( MÊS )', 'TORRE', 1, r.valor);

    INSERT INTO notas_fiscais_fat_direto
           (solicitacao_id, numero_nf, emitente, valor, data_emissao, status, descricao)
    VALUES (v_sol, r.numero_nf, r.emitente, r.valor, r.data_emissao, 'aprovada',
            r.tipo_doc || ' ' || r.numero_nf || ' — lançada na regularização de 28/07/2026.');

    v_criados := v_criados + 1;
    RAISE NOTICE 'Criado pedido % para % % (R$ %).', v_sol, r.tipo_doc, r.numero_nf, r.valor;
  END LOOP;

  RAISE NOTICE 'Resumo: % pedido(s) criado(s), % pulado(s) por já existirem.', v_criados, v_pulados;
END $$;

-- Confira as mensagens NOTICE acima. Se estiver certo:
COMMIT;
-- Se algo veio errado, rode: ROLLBACK;


-- ============================================================================
-- E3 — CONFERÊNCIA
-- Esperado: total do 19.1.1 no FIP-WAVE = 208.319,60, igual ao Informakon.
-- (163.934,70 que já havia + 44.384,90 desta regularização)
-- ============================================================================
SELECT COUNT(*)          AS qtd_notas,
       SUM(nf.valor)     AS total_nf_19_1_1
  FROM notas_fiscais_fat_direto nf
  JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
  JOIN itens_solicitacao_fat_direto i ON i.solicitacao_id = s.id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.status = 'aprovado'
   AND s.deletado_em IS NULL
   AND i.detalhamento_id = 'da866f02-fc19-a1ef-c99a-391bc906aa30';

-- Total de NF do contrato: era 3.267.477,95; deve ir para ~3.311.972,20
-- (44.384,90 do 19.1.1 + 10,20 das correções de valor do E1).
SELECT COUNT(*) AS qtd_nf, SUM(nf.valor) AS total_nf_sistema
  FROM notas_fiscais_fat_direto nf
  JOIN solicitacoes_fat_direto s ON s.id = nf.solicitacao_id
 WHERE s.contrato_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   AND s.status = 'aprovado'
   AND s.deletado_em IS NULL
   AND COALESCE(s.tipo, 'material_fornecedor') <> 'wave_servico';
