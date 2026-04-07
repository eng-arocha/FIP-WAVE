-- Migration 017: Corrige valor_material_unit e valor_servico_unit nos detalhamentos
-- que estão com zero, usando a proporção de material/serviço da tarefa pai.
-- Safe: só atualiza linhas onde AMBOS os campos são 0 (não sobrescreve dados corretos).

UPDATE detalhamentos d
SET
  valor_material_unit = ROUND(
    d.valor_unitario * (t.valor_material / NULLIF(t.valor_total, 0)),
    4
  ),
  valor_servico_unit = ROUND(
    d.valor_unitario * (t.valor_servico / NULLIF(t.valor_total, 0)),
    4
  )
FROM tarefas t
WHERE d.tarefa_id = t.id
  AND d.valor_material_unit = 0
  AND d.valor_servico_unit  = 0
  AND t.valor_total > 0;
