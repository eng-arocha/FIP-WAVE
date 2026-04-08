-- Migration 018: Corrige valor_material e valor_servico nas tarefas existentes
-- A migration 011 usou ON CONFLICT DO NOTHING e não atualizou linhas já existentes.
-- Cole no Supabase SQL Editor.

-- Garante que as colunas existem
ALTER TABLE tarefas
  ADD COLUMN IF NOT EXISTS valor_material NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico  NUMERIC(15,2) NOT NULL DEFAULT 0;

UPDATE tarefas SET valor_material = 14403.44, valor_servico = 16344.34 WHERE id = '8ef2c00c-8472-fe20-c5a3-5e090f71bc82';
UPDATE tarefas SET valor_material = 6453.21, valor_servico = 2442.20 WHERE id = 'efe17ea8-dee6-6267-d7ac-0738c6349726';
UPDATE tarefas SET valor_material = 320380.45, valor_servico = 28550.94 WHERE id = '266d1573-d5ac-c3ae-8d44-502d8749f403';
UPDATE tarefas SET valor_material = 10523.68, valor_servico = 16385.84 WHERE id = '044dc6cd-0d66-b7d0-3634-4151b60df888';
UPDATE tarefas SET valor_material = 14837.15, valor_servico = 5277.13 WHERE id = '8eba7215-c8aa-6161-acff-9bb32f9b5184';
UPDATE tarefas SET valor_material = 146668.20, valor_servico = 12706.04 WHERE id = '1ac1df64-6152-a2da-c04e-618085b57d2f';
UPDATE tarefas SET valor_material = 43816.48, valor_servico = 11088.90 WHERE id = '7d07ff97-0de8-bb33-ede6-78817ba09e57';
UPDATE tarefas SET valor_material = 119977.36, valor_servico = 4950.40 WHERE id = 'ef9a06aa-f2b0-be4e-fb89-956218f54a1d';
UPDATE tarefas SET valor_material = 12009.39, valor_servico = 11897.47 WHERE id = '25b156a4-20e8-253f-b373-f074f23abbc9';
UPDATE tarefas SET valor_material = 7838.02, valor_servico = 2772.23 WHERE id = '0489db72-268a-fb54-89e0-8874482155bd';
UPDATE tarefas SET valor_material = 71783.10, valor_servico = 6105.50 WHERE id = '61cccd8a-a01e-4ace-5a10-e4369540a6a0';
UPDATE tarefas SET valor_material = 21908.24, valor_servico = 5544.45 WHERE id = '3ebe4212-e8c7-8813-8f55-9c78a651b380';
UPDATE tarefas SET valor_material = 32751.20, valor_servico = 2970.24 WHERE id = 'ac90b5b8-1dc0-8cd8-976e-b5243b18c52e';
UPDATE tarefas SET valor_material = 15472.40, valor_servico = 10147.27 WHERE id = '68616ce3-cdad-e947-330b-15286b9091ca';
UPDATE tarefas SET valor_material = 431063.70, valor_servico = 15445.47 WHERE id = '488d62b0-ccd2-cef1-864f-cf39a7158e52';
UPDATE tarefas SET valor_material = 352689.90, valor_servico = 37161.40 WHERE id = '58a685be-9ae6-9ee0-a9f5-9dda93c29765';
UPDATE tarefas SET valor_material = 25823.49, valor_servico = 35118.29 WHERE id = '3b6cee64-f2c3-034f-f42a-ab141c104e89';
UPDATE tarefas SET valor_material = 115009.90, valor_servico = 29009.37 WHERE id = '884bae01-1bb7-a5a7-25a2-05761410adf4';
UPDATE tarefas SET valor_material = 415311.09, valor_servico = 15742.28 WHERE id = '4ba9c271-6a02-2bba-96eb-0b42bd8eb222';
UPDATE tarefas SET valor_material = 101132.64, valor_servico = 11880.97 WHERE id = '0380b53f-f8aa-f6f0-3ec5-f7dad1059e89';
UPDATE tarefas SET valor_material = 38592.13, valor_servico = 24969.76 WHERE id = '04c06583-f0b5-4595-848d-f824d478f887';
UPDATE tarefas SET valor_material = 124191.10, valor_servico = 51514.18 WHERE id = '0a435407-69d6-be27-b3d2-396c341bf920';
UPDATE tarefas SET valor_material = 6199.97, valor_servico = 3600.59 WHERE id = '3d7ad1e1-bcf9-eb8a-4a4a-7ea2ce05bf90';
UPDATE tarefas SET valor_material = 356035.46, valor_servico = 385390.55 WHERE id = 'c04079ee-6333-6e19-0a4f-0b442bc26f45';
UPDATE tarefas SET valor_material = 1141104.74, valor_servico = 652482.37 WHERE id = 'c2d03d67-2239-1d36-b037-836252535dc5';
UPDATE tarefas SET valor_material = 127341.25, valor_servico = 402794.88 WHERE id = '01fdc05a-78ec-2a68-4f75-5df05cf7d050';
UPDATE tarefas SET valor_material = 175718.45, valor_servico = 242849.88 WHERE id = 'b1c8aa5f-23b8-19d2-1b84-4a08ccc8f352';
UPDATE tarefas SET valor_material = 14076.51, valor_servico = 25115.05 WHERE id = 'f0af7843-372d-e1b8-3165-ad02d22bed0f';
UPDATE tarefas SET valor_material = 0.00, valor_servico = 287273.52 WHERE id = 'bf7a7a38-8f0b-391d-dd97-b05f48d113aa';
UPDATE tarefas SET valor_material = 661523.63, valor_servico = 312415.44 WHERE id = '974ed740-1cc7-805e-96ef-4afc0e6e0113';
UPDATE tarefas SET valor_material = 143093.30, valor_servico = 134708.07 WHERE id = 'bc83b534-3546-81e3-d7bb-8c3e6902729e';
UPDATE tarefas SET valor_material = 601272.53, valor_servico = 777108.51 WHERE id = '46b91a6c-c77e-12f4-1be9-3de563613e04';
UPDATE tarefas SET valor_material = 39371.99, valor_servico = 11261.81 WHERE id = '78cf38dd-10bd-8951-3e1b-f83d86fa17fb';
UPDATE tarefas SET valor_material = 850377.31, valor_servico = 1047756.45 WHERE id = '7c11b4a4-a002-04eb-24f0-06b8dc96fb6e';
UPDATE tarefas SET valor_material = 738473.57, valor_servico = 683602.35 WHERE id = 'c003a631-a38e-3f20-3256-896e58f79191';
UPDATE tarefas SET valor_material = 340264.72, valor_servico = 332979.61 WHERE id = 'cecf58c1-f4cd-c5c5-5629-f6daa349d302';
UPDATE tarefas SET valor_material = 574966.30, valor_servico = 182053.96 WHERE id = 'abc9f4d1-f216-8143-436a-9acaedaa1dd9';
UPDATE tarefas SET valor_material = 89578.25, valor_servico = 39196.50 WHERE id = '91657f80-e132-9315-56a9-760df5a77555';
UPDATE tarefas SET valor_material = 0.00, valor_servico = 18000.61 WHERE id = '8cba73cb-ead5-c87f-9225-c96236e2ee09';
UPDATE tarefas SET valor_material = 71112.44, valor_servico = 37174.54 WHERE id = '2f2c41b0-e82c-652c-bc14-0a71e60ec148';
UPDATE tarefas SET valor_material = 302777.99, valor_servico = 37709.97 WHERE id = '014cf2ba-a2c3-86eb-523e-3a4bba1d6d4f';
UPDATE tarefas SET valor_material = 895345.44, valor_servico = 307269.48 WHERE id = 'e5977692-4f97-b012-e08e-d2df4cedd5d3';
UPDATE tarefas SET valor_material = 114044.75, valor_servico = 25182.08 WHERE id = 'f7363bb4-052f-ce59-7ad2-e839a08717ee';
UPDATE tarefas SET valor_material = 39558.21, valor_servico = 20973.21 WHERE id = 'e27bb86b-db5c-846c-6520-6b7b105951e0';
UPDATE tarefas SET valor_material = 80278.63, valor_servico = 9658.29 WHERE id = '6f1829f2-6813-0079-a9f3-7f285f5522a5';
UPDATE tarefas SET valor_material = 59829.91, valor_servico = 79962.37 WHERE id = '4622febb-2ffc-d980-ed20-d64ef1103d48';
UPDATE tarefas SET valor_material = 26811.43, valor_servico = 29508.86 WHERE id = '0009349d-287b-0cfc-2dad-447b348dfd35';
UPDATE tarefas SET valor_material = 165878.55, valor_servico = 40783.07 WHERE id = '6be41991-3697-f581-1baa-fad46fa0e2fc';
UPDATE tarefas SET valor_material = 105317.78, valor_servico = 55776.12 WHERE id = '273aabfa-a3c1-f4a7-8bb9-eb605307b7af';
UPDATE tarefas SET valor_material = 191601.77, valor_servico = 144323.09 WHERE id = '227ee554-792f-c9d2-4283-aff7448c4eb7';
UPDATE tarefas SET valor_material = 866000.00, valor_servico = 0.00 WHERE id = '8b6ab969-5fb9-4e98-aa3d-31489278657c';

-- Agora re-aplica fix nos detalhamentos (mesma lógica da migration 017)
-- Com tarefas corrigidas, o cálculo funciona
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
