-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 078 — Renomear o detalhamento 19.1.2
--
--   de:   FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS
--   para: FURAÇÃO / PASSAGENS VIGAS E LAJES
--
-- `detalhamentos.descricao` é a fonte que a tela de medição, o boletim
-- Informakon, o PDF, o Excel e os e-mails leem — trocar aqui troca em todos.
--
-- Nada mais precisa mudar no banco: `medicao_itens` não guarda snapshot da
-- descrição (referencia `detalhamento_id`), então medições já aprovadas
-- passam a exibir o texto novo sem perder valor nem histórico.
--
-- No código, `lib/data/informakon-codigos.ts` resolve o código CT/Serv
-- (1382/334) pelo FINGERPRINT DA DESCRIÇÃO — foi atualizado junto, mantendo
-- o texto antigo como alias. E `lib/informakon/parser.ts` segue aceitando o
-- texto antigo, porque quem o escreve é o Informakon, não este sistema.
--
-- Idempotente: o WHERE só casa enquanto a descrição antiga estiver lá.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE detalhamentos d
   SET descricao = 'FURAÇÃO / PASSAGENS VIGAS E LAJES'
  FROM tarefas t
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
 WHERE d.tarefa_id = t.id
   AND d.codigo = '19.1.2'
   AND d.descricao = 'FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS';

-- Confirmação
SELECT g.codigo AS grupo, t.codigo AS tarefa, d.codigo, d.descricao,
       d.quantidade_contratada, d.valor_unitario
  FROM detalhamentos d
  JOIN tarefas t ON t.id = d.tarefa_id
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
 WHERE d.codigo IN ('19.1.1', '19.1.2')
 ORDER BY d.codigo;
