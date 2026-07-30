-- Migration 076: renomear a tarefa 19.1 de "DESCREVER SUBDIVISÃO"
--
-- "DESCREVER SUBDIVISÃO" era um placeholder deixado na importação original
-- do orçamento (migration 005). Ele nunca aparecia na interface porque o
-- grupo 19 estava escondido da tela de medição por dois filtros
-- (tipo_medicao = 'faturamento_direto' e um `num <= 18` hardcoded).
--
-- Agora o grupo 19 é medido pelo avanço físico — a administração de obra é
-- apropriada mês a mês, senão o contrato nunca fecha 100% e o total diverge
-- do INFORMAKON — então o placeholder passou a ficar visível para o usuário.
--
-- O novo nome descreve o que a tarefa de fato é: os itens dela (19.1.1
-- administração e 19.1.2 fechamentos) são medidos aqui, mas a nota é emitida
-- por terceiro, fora do circuito FIP/Wave.
--
-- Idempotente: o WHERE só casa enquanto o placeholder estiver lá.

UPDATE tarefas t
   SET nome = 'FATURAMENTO DIRETO SERVIÇO'
  FROM grupos_macro g
 WHERE t.grupo_macro_id = g.id
   AND g.codigo = '19'
   AND t.nome = 'DESCREVER SUBDIVISÃO';

-- Confirmação
SELECT g.codigo AS grupo, t.codigo AS tarefa, t.nome, t.valor_total
  FROM tarefas t
  JOIN grupos_macro g ON g.id = t.grupo_macro_id
 WHERE g.codigo = '19'
 ORDER BY t.codigo;
