-- Migration 072: corrigir quantidade_contratada do item 14.2.2
--
-- O item 14.2.2 foi cadastrado com quantidade_contratada = 2, mas o valor
-- correto é 1 (item indivisível — prumada única). A coluna valor_total é
-- GENERATED ALWAYS AS (quantidade_contratada * valor_unitario), portanto
-- se atualiza automaticamente.
--
-- Idempotente: a cláusula WHERE garante que só atualiza se ainda estiver errado.

UPDATE detalhamentos
SET quantidade_contratada = 1
WHERE codigo = '14.2.2'
  AND quantidade_contratada = 2;

-- Confirmação
SELECT codigo, SUBSTR(descricao, 1, 70) AS descricao, quantidade_contratada, valor_total
  FROM detalhamentos
 WHERE codigo = '14.2.2';
