-- Migration 019: Corrige valor_material/valor_servico por CODIGO (não por ID)
-- A migration 018 usou IDs hardcoded que não existem na base real.
-- Cole no Supabase SQL Editor.

UPDATE tarefas SET valor_material = 14403.44, valor_servico = 16344.34 WHERE codigo = '1.1';
UPDATE tarefas SET valor_material = 6453.21, valor_servico = 2442.20 WHERE codigo = '1.2';
UPDATE tarefas SET valor_material = 320380.45, valor_servico = 28550.94 WHERE codigo = '1.3';
UPDATE tarefas SET valor_material = 10523.68, valor_servico = 16385.84 WHERE codigo = '1.4';
UPDATE tarefas SET valor_material = 14837.15, valor_servico = 5277.13 WHERE codigo = '1.5';
UPDATE tarefas SET valor_material = 146668.20, valor_servico = 12706.04 WHERE codigo = '1.6.';
UPDATE tarefas SET valor_material = 43816.48, valor_servico = 11088.90 WHERE codigo = '1.7';
UPDATE tarefas SET valor_material = 119977.36, valor_servico = 4950.40 WHERE codigo = '1.8';
UPDATE tarefas SET valor_material = 12009.39, valor_servico = 11897.47 WHERE codigo = '1.9';
UPDATE tarefas SET valor_material = 7838.02, valor_servico = 2772.23 WHERE codigo = '1.10';
UPDATE tarefas SET valor_material = 71783.10, valor_servico = 6105.50 WHERE codigo = '1.11';
UPDATE tarefas SET valor_material = 21908.24, valor_servico = 5544.45 WHERE codigo = '1.12';
UPDATE tarefas SET valor_material = 32751.20, valor_servico = 2970.24 WHERE codigo = '1.13';
UPDATE tarefas SET valor_material = 15472.40, valor_servico = 10147.27 WHERE codigo = '1.14';
UPDATE tarefas SET valor_material = 431063.70, valor_servico = 15445.47 WHERE codigo = '2.1';
UPDATE tarefas SET valor_material = 352689.90, valor_servico = 37161.40 WHERE codigo = '2.2';
UPDATE tarefas SET valor_material = 25823.49, valor_servico = 35118.29 WHERE codigo = '2.3';
UPDATE tarefas SET valor_material = 115009.90, valor_servico = 29009.37 WHERE codigo = '2.4';
UPDATE tarefas SET valor_material = 415311.09, valor_servico = 15742.28 WHERE codigo = '2.5';
UPDATE tarefas SET valor_material = 101132.64, valor_servico = 11880.97 WHERE codigo = '2.6';
UPDATE tarefas SET valor_material = 38592.13, valor_servico = 24969.76 WHERE codigo = '2.7';
UPDATE tarefas SET valor_material = 124191.10, valor_servico = 51514.18 WHERE codigo = '2.8';
UPDATE tarefas SET valor_material = 6199.97, valor_servico = 3600.59 WHERE codigo = '2.9';
UPDATE tarefas SET valor_material = 356035.46, valor_servico = 385390.55 WHERE codigo = '3.1';
UPDATE tarefas SET valor_material = 1141104.74, valor_servico = 652482.37 WHERE codigo = '3.2';
UPDATE tarefas SET valor_material = 127341.25, valor_servico = 402794.88 WHERE codigo = '4.1';
UPDATE tarefas SET valor_material = 175718.45, valor_servico = 242849.88 WHERE codigo = '4.2';
UPDATE tarefas SET valor_material = 14076.51, valor_servico = 25115.05 WHERE codigo = '4.3';
UPDATE tarefas SET valor_material = 0.00, valor_servico = 287273.52 WHERE codigo = '5.1';
UPDATE tarefas SET valor_material = 661523.63, valor_servico = 312415.44 WHERE codigo = '6.1';
UPDATE tarefas SET valor_material = 143093.30, valor_servico = 134708.07 WHERE codigo = '7.1';
UPDATE tarefas SET valor_material = 601272.53, valor_servico = 777108.51 WHERE codigo = '8.1';
UPDATE tarefas SET valor_material = 39371.99, valor_servico = 11261.81 WHERE codigo = '8.2';
UPDATE tarefas SET valor_material = 850377.31, valor_servico = 1047756.45 WHERE codigo = '9.1';
UPDATE tarefas SET valor_material = 738473.57, valor_servico = 683602.35 WHERE codigo = '10.1';
UPDATE tarefas SET valor_material = 340264.72, valor_servico = 332979.61 WHERE codigo = '10.2';
UPDATE tarefas SET valor_material = 574966.30, valor_servico = 182053.96 WHERE codigo = '10.3';
UPDATE tarefas SET valor_material = 89578.25, valor_servico = 39196.50 WHERE codigo = '12.1';
UPDATE tarefas SET valor_material = 0.00, valor_servico = 18000.61 WHERE codigo = '13.1';
UPDATE tarefas SET valor_material = 71112.44, valor_servico = 37174.54 WHERE codigo = '13.2';
UPDATE tarefas SET valor_material = 302777.99, valor_servico = 37709.97 WHERE codigo = '14.1';
UPDATE tarefas SET valor_material = 895345.44, valor_servico = 307269.48 WHERE codigo = '14.2';
UPDATE tarefas SET valor_material = 114044.75, valor_servico = 25182.08 WHERE codigo = '14.3';
UPDATE tarefas SET valor_material = 39558.21, valor_servico = 20973.21 WHERE codigo = '15.1';
UPDATE tarefas SET valor_material = 80278.63, valor_servico = 9658.29 WHERE codigo = '15.2';
UPDATE tarefas SET valor_material = 59829.91, valor_servico = 79962.37 WHERE codigo = '16.1';
UPDATE tarefas SET valor_material = 26811.43, valor_servico = 29508.86 WHERE codigo = '16.2';
UPDATE tarefas SET valor_material = 165878.55, valor_servico = 40783.07 WHERE codigo = '16.3';
UPDATE tarefas SET valor_material = 105317.78, valor_servico = 55776.12 WHERE codigo = '17.1';
UPDATE tarefas SET valor_material = 191601.77, valor_servico = 144323.09 WHERE codigo = '18.1';
UPDATE tarefas SET valor_material = 866000.00, valor_servico = 0.00 WHERE codigo = '19.1';

-- Agora recalcula detalhamentos a partir das tarefas corrigidas
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
  AND t.valor_total > 0
  AND t.valor_material > 0;
