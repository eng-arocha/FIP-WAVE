-- Migration 002: Adiciona valor_material e valor_servico em grupos_macro
-- Estes campos separam o custo de material (faturamento direto) do custo de mão de obra
-- conforme a planilha Cronograma Físico Financeiro WAVE - FIP rev 07

ALTER TABLE grupos_macro
  ADD COLUMN IF NOT EXISTS valor_material NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_servico  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Popular com valores reais do Cronograma rev 07
-- (valor_material + valor_servico = valor_contratado)
UPDATE grupos_macro SET valor_material =  838822.32, valor_servico =  137182.95 WHERE id = '5e18da9c-8fbe-541e-827b-ce0c71c46cfb'; -- 1.0  ELÉTRICA SUBESTAÇÃO
UPDATE grupos_macro SET valor_material = 1610013.92, valor_servico =  224442.31 WHERE id = '9e575072-9b8a-5959-bcaa-8612f2817cfb'; -- 2.0  GERAÇÃO
UPDATE grupos_macro SET valor_material = 1497140.20, valor_servico = 1037872.92 WHERE id = 'a8ceb338-8cd9-540d-a640-1424913e477e'; -- 3.0  ALIMENTAÇÃO ELÉTRICA
UPDATE grupos_macro SET valor_material =  317136.21, valor_servico =  670759.81 WHERE id = '9d494a19-f3dc-5442-a2fc-da97f9902649'; -- 4.0  DISTRIBUIÇÃO ELÉTRICA
UPDATE grupos_macro SET valor_material =       0.00, valor_servico =  287273.52 WHERE id = 'dd7418ad-f659-52d6-873f-479dc672f56d'; -- 5.0  LUMINÁRIAS
UPDATE grupos_macro SET valor_material =  661523.63, valor_servico =  312415.44 WHERE id = '4bda840c-cfe2-5265-941d-3579e8e57fbb'; -- 6.0  QUADROS ELÉTRICOS
UPDATE grupos_macro SET valor_material =  143093.30, valor_servico =  134708.07 WHERE id = '13cad5b3-b0e5-5b00-977d-c8898df703d1'; -- 7.0  LÓGICA (DADOS E VOZ)
UPDATE grupos_macro SET valor_material =  640644.52, valor_servico =  788370.32 WHERE id = '210b8abe-6171-546b-b0e2-48c9a7875ce0'; -- 8.0  ÁGUA PLUVIAL
UPDATE grupos_macro SET valor_material =  850377.31, valor_servico = 1047756.45 WHERE id = 'bf1ac326-3830-545a-8b12-7c8e69f65b05'; -- 9.0  ESGOTO
UPDATE grupos_macro SET valor_material = 1653704.59, valor_servico = 1198635.92 WHERE id = '6803e031-3218-5d16-baee-506e194295f5'; -- 10.0 HIDRÁULICA
UPDATE grupos_macro SET valor_material =   89578.25, valor_servico =   39196.50 WHERE id = 'ebed356e-ec28-55a5-b6b4-f4ebee3078c4'; -- 12.0 PISCINA E SPA
UPDATE grupos_macro SET valor_material =   71112.44, valor_servico =   55175.15 WHERE id = 'b9c89074-3aa7-5836-9b87-b53afbd753c7'; -- 13.0 LOUÇAS E METAIS
UPDATE grupos_macro SET valor_material = 1312168.18, valor_servico =  370161.53 WHERE id = '34917ab8-8f72-526b-99ac-b7c8c01f974d'; -- 14.0 COMBATE AO INCÊNDIO
UPDATE grupos_macro SET valor_material =  119836.84, valor_servico =   30631.50 WHERE id = '968a2019-5560-5969-895e-ca107572c268'; -- 15.0 EXTINTOR E SINALIZAÇÃO
UPDATE grupos_macro SET valor_material =  252519.89, valor_servico =  150254.30 WHERE id = '4b16df11-98e8-5337-97e3-6572179bbbe8'; -- 16.0 SDAI
UPDATE grupos_macro SET valor_material =  184726.63, valor_servico =   70840.22 WHERE id = '4996679b-1f15-5aaa-81f0-b5cc49a883a5'; -- 17.0 GÁS
UPDATE grupos_macro SET valor_material =  191601.77, valor_servico =  144323.09 WHERE id = 'bef7d1b5-f6c7-54d0-9d35-4b9c0201b7ee'; -- 18.0 SPDA
UPDATE grupos_macro SET valor_material =  866000.00, valor_servico =       0.00 WHERE id = '8177b8e3-f013-5519-a9ed-c8b5c5bd326c'; -- 19.0 SERVIÇOS COMPLEMENTARES
