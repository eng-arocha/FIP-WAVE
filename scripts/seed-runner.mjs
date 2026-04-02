#!/usr/bin/env node
// ============================================================
// FIP-WAVE — Seed Runner com dados reais do Cronograma WAVE
// Execute: node scripts/seed-runner.js <SERVICE_ROLE_KEY>
// ============================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ktfoozriunzoeeoqfpns.supabase.co'
const SERVICE_ROLE_KEY = process.argv[2]
const CONTRATO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

if (!SERVICE_ROLE_KEY) {
  console.error('\n❌  Uso: node scripts/seed-runner.js <SERVICE_ROLE_KEY>')
  console.error('   Encontre em: Supabase Dashboard → Settings → API → service_role\n')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ──────────────────────────────────────────
// DADOS: 18 grupos, 51 tarefas, 335 detalhamentos
// ──────────────────────────────────────────
const GRUPOS = [
  {
    "id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "1.0",
    "nome": "ELÉTRICA SUBESTAÇÃO",
    "tipo_medicao": "misto",
    "valor_contratado": 976005.27,
    "ordem": 1
  },
  {
    "id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "2.0",
    "nome": "GERAÇÃO",
    "tipo_medicao": "misto",
    "valor_contratado": 1834456.23,
    "ordem": 2
  },
  {
    "id": "a8ceb338-8cd9-540d-a640-1424913e477e",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "3.0",
    "nome": "ALIMENTAÇÃO ELÉTRICA",
    "tipo_medicao": "misto",
    "valor_contratado": 2535013.12,
    "ordem": 3
  },
  {
    "id": "9d494a19-f3dc-5442-a2fc-da97f9902649",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "4.0",
    "nome": "DISTRIBUIÇÃO ELÉTRICA",
    "tipo_medicao": "misto",
    "valor_contratado": 987896.02,
    "ordem": 4
  },
  {
    "id": "dd7418ad-f659-52d6-873f-479dc672f56d",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "5.0",
    "nome": "LUMINÁRIAS",
    "tipo_medicao": "servico",
    "valor_contratado": 287273.52,
    "ordem": 5
  },
  {
    "id": "4bda840c-cfe2-5265-941d-3579e8e57fbb",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "6.0",
    "nome": "QUADROS ELÉTRICOS",
    "tipo_medicao": "misto",
    "valor_contratado": 973939.07,
    "ordem": 6
  },
  {
    "id": "13cad5b3-b0e5-5b00-977d-c8898df703d1",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "7.0",
    "nome": "LÓGICA (DADOS E VOZ) - INFRA SECA",
    "tipo_medicao": "misto",
    "valor_contratado": 277801.37,
    "ordem": 7
  },
  {
    "id": "210b8abe-6171-546b-b0e2-48c9a7875ce0",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "8.0",
    "nome": "ÁGUA PLUVIAL",
    "tipo_medicao": "misto",
    "valor_contratado": 1429014.84,
    "ordem": 8
  },
  {
    "id": "bf1ac326-3830-545a-8b12-7c8e69f65b05",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "9.0",
    "nome": "ESGOTO",
    "tipo_medicao": "misto",
    "valor_contratado": 1898133.76,
    "ordem": 9
  },
  {
    "id": "6803e031-3218-5d16-baee-506e194295f5",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "10.0",
    "nome": "HIDRÁULICA",
    "tipo_medicao": "misto",
    "valor_contratado": 2852340.51,
    "ordem": 10
  },
  {
    "id": "ebed356e-ec28-55a5-b6b4-f4ebee3078c4",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "12.0",
    "nome": "PISCINA E SPA",
    "tipo_medicao": "misto",
    "valor_contratado": 128774.75,
    "ordem": 11
  },
  {
    "id": "b9c89074-3aa7-5836-9b87-b53afbd753c7",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "13.0",
    "nome": "LOUÇAS E METAIS",
    "tipo_medicao": "misto",
    "valor_contratado": 126287.59,
    "ordem": 12
  },
  {
    "id": "34917ab8-8f72-526b-99ac-b7c8c01f974d",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "14.0",
    "nome": "COMBATE AO INCÊNDIO",
    "tipo_medicao": "misto",
    "valor_contratado": 1682329.71,
    "ordem": 13
  },
  {
    "id": "968a2019-5560-5969-895e-ca107572c268",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "15.0",
    "nome": "EXTINTOR E SINALIZAÇÃO",
    "tipo_medicao": "misto",
    "valor_contratado": 150468.34,
    "ordem": 14
  },
  {
    "id": "4b16df11-98e8-5337-97e3-6572179bbbe8",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "16.0",
    "nome": "SISTEMA DE DETECÇÃO E ALARME DE INCÊNDIO (SDAI)",
    "tipo_medicao": "misto",
    "valor_contratado": 402774.19,
    "ordem": 15
  },
  {
    "id": "4996679b-1f15-5aaa-81f0-b5cc49a883a5",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "17.0",
    "nome": "GÁS",
    "tipo_medicao": "misto",
    "valor_contratado": 255566.85,
    "ordem": 16
  },
  {
    "id": "bef7d1b5-f6c7-54d0-9d35-4b9c0201b7ee",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "18.0",
    "nome": "SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA",
    "tipo_medicao": "misto",
    "valor_contratado": 335924.86,
    "ordem": 17
  },
  {
    "id": "8177b8e3-f013-5519-a9ed-c8b5c5bd326c",
    "contrato_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "codigo": "19.0",
    "nome": "SERVIÇOS COMPLEMENTARES",
    "tipo_medicao": "faturamento_direto",
    "valor_contratado": 866000.0,
    "ordem": 18
  }
]

const TAREFAS = [
  {
    "id": "f633a8ac-3b28-5fac-b6f7-f7adb0e5d341",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.1",
    "nome": "ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 30747.78,
    "valor_total": 30747.78,
    "ordem": 1
  },
  {
    "id": "4888a5b4-7dc1-5dd8-8544-f7c46994bdb4",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.2",
    "nome": "ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8895.41,
    "valor_total": 8895.41,
    "ordem": 2
  },
  {
    "id": "6b9748b0-0145-5f66-96c5-26d1a2c65905",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.3",
    "nome": "ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 348931.39,
    "valor_total": 348931.39,
    "ordem": 3
  },
  {
    "id": "2585948c-42e9-5cf4-a1e8-1e456615c081",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.4",
    "nome": "SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 26909.52,
    "valor_total": 26909.52,
    "ordem": 4
  },
  {
    "id": "7161a30e-4d1c-53aa-8318-63681d624fd6",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.5",
    "nome": "SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 20114.28,
    "valor_total": 20114.28,
    "ordem": 5
  },
  {
    "id": "fe997abf-c3ea-5f07-8d9a-475aebda2d25",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.6",
    "nome": "SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 159374.24,
    "valor_total": 159374.24,
    "ordem": 6
  },
  {
    "id": "a117d576-bf97-5503-a772-a3e4357d3cb8",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.7",
    "nome": "SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG's )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 54905.38,
    "valor_total": 54905.38,
    "ordem": 7
  },
  {
    "id": "5e7bee6c-6b3c-5e08-81e8-621bb8df65af",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.8",
    "nome": "SUBESTAÇÃO PMUC - QUADROS ( CPG's )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 124927.76,
    "valor_total": 124927.76,
    "ordem": 8
  },
  {
    "id": "4a9a0776-8362-5d68-acf5-70d616e17649",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.9",
    "nome": "SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23906.86,
    "valor_total": 23906.86,
    "ordem": 9
  },
  {
    "id": "13b23fde-2aa0-5182-a794-49d72d9ce206",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.10",
    "nome": "SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 10610.25,
    "valor_total": 10610.25,
    "ordem": 10
  },
  {
    "id": "e76e13f1-1914-5102-8642-3d7b96117b73",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.11",
    "nome": "SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 77888.6,
    "valor_total": 77888.6,
    "ordem": 11
  },
  {
    "id": "2f5d93f3-9c8e-51f2-bcfe-8b0e63718a36",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.12",
    "nome": "SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG')",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27452.69,
    "valor_total": 27452.69,
    "ordem": 12
  },
  {
    "id": "7fc437e0-520c-5a2d-a710-11782a2ec37d",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.13",
    "nome": "SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 35721.44,
    "valor_total": 35721.44,
    "ordem": 13
  },
  {
    "id": "9703bb7f-6f9c-53c3-b559-3fe7c7599d39",
    "grupo_macro_id": "5e18da9c-8fbe-541e-827b-ce0c71c46cfb",
    "codigo": "1.14",
    "nome": "ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 25619.67,
    "valor_total": 25619.67,
    "ordem": 14
  },
  {
    "id": "5add1039-d180-5ff0-abf9-22877c669cad",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.1",
    "nome": "GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 446509.17,
    "valor_total": 446509.17,
    "ordem": 15
  },
  {
    "id": "6a3eee1a-31f8-54c6-a658-7de57dd057f9",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.2",
    "nome": "GRUPO GERADOR PMUC  - PAINEIS (  QTA's + Quadros reversão )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 389851.3,
    "valor_total": 389851.3,
    "ordem": 16
  },
  {
    "id": "a7ad0ef7-bfc6-5934-b4ad-85d9da2acbde",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.3",
    "nome": "GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 60941.78,
    "valor_total": 60941.78,
    "ordem": 17
  },
  {
    "id": "6e893673-c1c0-5887-aea4-6250969dfac4",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.4",
    "nome": "GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 144019.27,
    "valor_total": 144019.27,
    "ordem": 18
  },
  {
    "id": "d744e91d-8718-5608-82bd-4df3395e42a9",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.5",
    "nome": "GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 431053.37,
    "valor_total": 431053.37,
    "ordem": 19
  },
  {
    "id": "644b8ce8-8d45-5fd0-ba4c-73208a0c11b9",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.6",
    "nome": "GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 113013.61,
    "valor_total": 113013.61,
    "ordem": 20
  },
  {
    "id": "68f25f10-01c8-500b-969f-ad47e0a130b5",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.7",
    "nome": "GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 63561.89,
    "valor_total": 63561.89,
    "ordem": 21
  },
  {
    "id": "cc31e44a-5b56-5f64-876a-65d95a065990",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.8",
    "nome": "GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 175705.28,
    "valor_total": 175705.28,
    "ordem": 22
  },
  {
    "id": "6efb97e5-855e-5be6-8b04-8a40d4cdb104",
    "grupo_macro_id": "9e575072-9b8a-5959-bcaa-8612f2817cfb",
    "codigo": "2.9",
    "nome": "GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9800.56,
    "valor_total": 9800.56,
    "ordem": 23
  },
  {
    "id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "grupo_macro_id": "a8ceb338-8cd9-540d-a640-1424913e477e",
    "codigo": "3.1",
    "nome": "INFRAESTRUTURA -  ALIMENTAÇÃO ELÉTRICA ( Eletrocalhas,Eletrodutos, caixas )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 741426.01,
    "valor_total": 741426.01,
    "ordem": 24
  },
  {
    "id": "b42bda49-c588-564b-9074-1548d573683f",
    "grupo_macro_id": "a8ceb338-8cd9-540d-a640-1424913e477e",
    "codigo": "3.2",
    "nome": "CABEAMENTO- ALIMENTAÇÃO ELÉTRICA ( CABOS ATOX 1KV )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1793587.11,
    "valor_total": 1793587.11,
    "ordem": 25
  },
  {
    "id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "grupo_macro_id": "9d494a19-f3dc-5442-a2fc-da97f9902649",
    "codigo": "4.1",
    "nome": "INFRAESTRUTURA -  DISTRIBUIÇÃO ELÉTRICA (Eletrocalhas, eletrodutos e caixas )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 530136.13,
    "valor_total": 530136.13,
    "ordem": 26
  },
  {
    "id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "grupo_macro_id": "9d494a19-f3dc-5442-a2fc-da97f9902649",
    "codigo": "4.2",
    "nome": "CABEAMENTO- DISTRIBUIÇÃO ELETRICA ( Cabos 750v 2,5mm², 4mm² e 6mm² )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 418568.33,
    "valor_total": 418568.33,
    "ordem": 27
  },
  {
    "id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "grupo_macro_id": "9d494a19-f3dc-5442-a2fc-da97f9902649",
    "codigo": "4.3",
    "nome": "ACABAMENTO - DISTRIBUIÇÃO ELETRICA ( Tomadas e Interruptores )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 39191.56,
    "valor_total": 39191.56,
    "ordem": 28
  },
  {
    "id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "grupo_macro_id": "dd7418ad-f659-52d6-873f-479dc672f56d",
    "codigo": "5.1",
    "nome": "NSTALAÇÕES DE LUMINÁRIAS CONFORME PROJETO ( SOMENTE MÃO DE OBRA )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 287273.52,
    "valor_total": 287273.52,
    "ordem": 29
  },
  {
    "id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "grupo_macro_id": "4bda840c-cfe2-5265-941d-3579e8e57fbb",
    "codigo": "6.1",
    "nome": "QUADROS DE ILUMINAÇÃO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 973939.07,
    "valor_total": 973939.07,
    "ordem": 30
  },
  {
    "id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "grupo_macro_id": "13cad5b3-b0e5-5b00-977d-c8898df703d1",
    "codigo": "7.1",
    "nome": "INFRAESTRUTURA -  DADOS E VOZ (Eletrocalhas, eletrodutos e caixas )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 277801.37,
    "valor_total": 277801.37,
    "ordem": 31
  },
  {
    "id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "grupo_macro_id": "210b8abe-6171-546b-b0e2-48c9a7875ce0",
    "codigo": "8.1",
    "nome": "ÁGUA PLUVIAL ( TUBOS E CONEXÕES )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1378381.04,
    "valor_total": 1378381.04,
    "ordem": 32
  },
  {
    "id": "b31a850f-361e-5dcf-a051-fbedd22606a0",
    "grupo_macro_id": "210b8abe-6171-546b-b0e2-48c9a7875ce0",
    "codigo": "8.2",
    "nome": "BARRILHETE DE BOMBAS DRENAGEM",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 50633.8,
    "valor_total": 50633.8,
    "ordem": 33
  },
  {
    "id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "grupo_macro_id": "bf1ac326-3830-545a-8b12-7c8e69f65b05",
    "codigo": "9.1",
    "nome": "ESGOTO SANITARIO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1898133.76,
    "valor_total": 1898133.76,
    "ordem": 34
  },
  {
    "id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "grupo_macro_id": "6803e031-3218-5d16-baee-506e194295f5",
    "codigo": "10.1",
    "nome": "HIDRÁULICA (ÁGUA FRIA)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1422075.92,
    "valor_total": 1422075.92,
    "ordem": 35
  },
  {
    "id": "12f8189e-4f46-5b06-8dff-1627f02b22f0",
    "grupo_macro_id": "6803e031-3218-5d16-baee-506e194295f5",
    "codigo": "10.2",
    "nome": "HIDRÁULICA (ÁGUA QUENTE)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 673244.33,
    "valor_total": 673244.33,
    "ordem": 36
  },
  {
    "id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "grupo_macro_id": "6803e031-3218-5d16-baee-506e194295f5",
    "codigo": "10.3",
    "nome": "HIDRÁULICA (BARRILHETES BOMBAS E REDUTORAS)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 757020.26,
    "valor_total": 757020.26,
    "ordem": 37
  },
  {
    "id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "grupo_macro_id": "b9c89074-3aa7-5836-9b87-b53afbd753c7",
    "codigo": "13.1",
    "nome": "PILOTIS ( SÓ MÃO DE OBRA )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18000.61,
    "valor_total": 18000.61,
    "ordem": 38
  },
  {
    "id": "7398d188-1fff-598a-bbd4-374d4a412c18",
    "grupo_macro_id": "b9c89074-3aa7-5836-9b87-b53afbd753c7",
    "codigo": "13.2",
    "nome": "APARTAMENTOS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 108286.98,
    "valor_total": 108286.98,
    "ordem": 39
  },
  {
    "id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "grupo_macro_id": "34917ab8-8f72-526b-99ac-b7c8c01f974d",
    "codigo": "14.1",
    "nome": "HIDRANTE",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 340487.96,
    "valor_total": 340487.96,
    "ordem": 40
  },
  {
    "id": "b202e016-c034-5355-bbb7-f701c5403262",
    "grupo_macro_id": "34917ab8-8f72-526b-99ac-b7c8c01f974d",
    "codigo": "14.2",
    "nome": "SPRINKLERS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1202614.92,
    "valor_total": 1202614.92,
    "ordem": 41
  },
  {
    "id": "b4cf8639-0e69-5983-8a36-312b89d775eb",
    "grupo_macro_id": "34917ab8-8f72-526b-99ac-b7c8c01f974d",
    "codigo": "14.3",
    "nome": "BOMBAS E BARRILHETES",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 139226.83,
    "valor_total": 139226.83,
    "ordem": 42
  },
  {
    "id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "grupo_macro_id": "968a2019-5560-5969-895e-ca107572c268",
    "codigo": "15.1",
    "nome": "LUMINARIAS DE EMERGENCIA + ROTA DE FUGA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 60531.42,
    "valor_total": 60531.42,
    "ordem": 43
  },
  {
    "id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "grupo_macro_id": "968a2019-5560-5969-895e-ca107572c268",
    "codigo": "15.2",
    "nome": "EXTINTORES",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 89936.92,
    "valor_total": 89936.92,
    "ordem": 44
  },
  {
    "id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "grupo_macro_id": "4b16df11-98e8-5337-97e3-6572179bbbe8",
    "codigo": "16.1",
    "nome": "INFRA ESTRUTURA ( ELTRODUTOS E CAIXAS )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 139792.28,
    "valor_total": 139792.28,
    "ordem": 45
  },
  {
    "id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "grupo_macro_id": "4b16df11-98e8-5337-97e3-6572179bbbe8",
    "codigo": "16.2",
    "nome": "CABEAMENTO SDAI ( CABO BLINDADO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 56320.29,
    "valor_total": 56320.29,
    "ordem": 46
  },
  {
    "id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "grupo_macro_id": "4b16df11-98e8-5337-97e3-6572179bbbe8",
    "codigo": "16.3",
    "nome": "EQUIPAMENTOS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 206661.62,
    "valor_total": 206661.62,
    "ordem": 47
  },
  {
    "id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "grupo_macro_id": "4996679b-1f15-5aaa-81f0-b5cc49a883a5",
    "codigo": "17.1",
    "nome": "TUBOS E CONEXÕES",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 161093.9,
    "valor_total": 161093.9,
    "ordem": 48
  },
  {
    "id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "grupo_macro_id": "4996679b-1f15-5aaa-81f0-b5cc49a883a5",
    "codigo": "17.1",
    "nome": "CAIXAS, REGULADORES E VALVULAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 94472.95,
    "valor_total": 94472.95,
    "ordem": 49
  },
  {
    "id": "141e3325-4189-5a52-8232-efac10938eed",
    "grupo_macro_id": "bef7d1b5-f6c7-54d0-9d35-4b9c0201b7ee",
    "codigo": "18.1",
    "nome": "SPDA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 335924.86,
    "valor_total": 335924.86,
    "ordem": 50
  },
  {
    "id": "2f830ba5-d731-558a-bfe2-17d4dbccfacb",
    "grupo_macro_id": "8177b8e3-f013-5519-a9ed-c8b5c5bd326c",
    "codigo": "19.1",
    "nome": "DESCREVER SUBDIVISÃO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 866000.0,
    "valor_total": 866000.0,
    "ordem": 51
  }
]

const DETALHAMENTOS = [
  {
    "id": "0a9e8781-e270-5af6-9c3d-e7772862cdca",
    "tarefa_id": "f633a8ac-3b28-5fac-b6f7-f7adb0e5d341",
    "codigo": "1.1.1",
    "descricao": "ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 30747.78,
    "ordem": 1
  },
  {
    "id": "976ad1b9-5e1f-5be2-ac1d-6b4146c0d843",
    "tarefa_id": "4888a5b4-7dc1-5dd8-8544-f7c46994bdb4",
    "codigo": "1.2.1",
    "descricao": "ENTRADA DE ENERGIA - CABEAMENTO MÉDIA ( Poste ao PMT  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8895.41,
    "ordem": 2
  },
  {
    "id": "3b5a31c5-c310-5ab0-a78f-2a9cca1293f8",
    "tarefa_id": "6b9748b0-0145-5f66-96c5-26d1a2c65905",
    "codigo": "1.3.1",
    "descricao": "ENTRADA DE ENERGIA - EQUIPAMENTOS( Painel de Média Tensão  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 348931.39,
    "ordem": 3
  },
  {
    "id": "08e289d6-5054-52dc-a2ad-46a5e515601a",
    "tarefa_id": "2585948c-42e9-5cf4-a1e8-1e456615c081",
    "codigo": "1.4.1",
    "descricao": "SUBESTAÇÃO PMUC - INFRAESTRUTURA ( PMT até Subestação PMUC + Trafo ao CPG)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 26909.52,
    "ordem": 4
  },
  {
    "id": "8d5274aa-c1ee-5456-88ea-b98dc8f2c0f2",
    "tarefa_id": "7161a30e-4d1c-53aa-8318-63681d624fd6",
    "codigo": "1.5.1",
    "descricao": "SUBESTAÇÃO PMUC - CABEAMENTO MÉDIA ( PMT até Subestação PMUC )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 20114.28,
    "ordem": 5
  },
  {
    "id": "c674d6f4-c393-5e0d-9e58-bce735a50612",
    "tarefa_id": "fe997abf-c3ea-5f07-8d9a-475aebda2d25",
    "codigo": "1.6.1",
    "descricao": "SUBESTAÇÃO PMUC - EQUIPAMENTO ( Tranformadores e fechamentos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 159374.24,
    "ordem": 6
  },
  {
    "id": "d48d14d2-c39f-558e-aeb8-828205e4296d",
    "tarefa_id": "a117d576-bf97-5503-a772-a3e4357d3cb8",
    "codigo": "1.7.1",
    "descricao": "SUBESTAÇÃO PMUC - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG's )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 54905.38,
    "ordem": 7
  },
  {
    "id": "5c4529f8-b762-5c26-a2ab-b091935512e6",
    "tarefa_id": "5e7bee6c-6b3c-5e08-81e8-621bb8df65af",
    "codigo": "1.8.1",
    "descricao": "SUBESTAÇÃO PMUC - QUADROS ( CPG's )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 124927.76,
    "ordem": 8
  },
  {
    "id": "84d3815c-695b-5533-921f-95e307216199",
    "tarefa_id": "4a9a0776-8362-5d68-acf5-70d616e17649",
    "codigo": "1.9.1",
    "descricao": "SUBESTAÇÃO GRUPO A  - INFRAESTRUTURA ( PMT até Subestação GRUPO A  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23906.86,
    "ordem": 9
  },
  {
    "id": "236a280e-daa6-529c-81b4-21619df4cac8",
    "tarefa_id": "13b23fde-2aa0-5182-a794-49d72d9ce206",
    "codigo": "1.10.1",
    "descricao": "SUBESTAÇÃO GRUPO A  - CABEAMENTO MÉDIA ( PMT até Subestação GRUPO A  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 10610.25,
    "ordem": 10
  },
  {
    "id": "5d954462-0aeb-5035-a9e7-81a2784c4afc",
    "tarefa_id": "e76e13f1-1914-5102-8642-3d7b96117b73",
    "codigo": "1.11.1",
    "descricao": "SUBESTAÇÃO GRUPO A  - EQUIPAMENTO ( Tranformador e fechamentos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 77888.6,
    "ordem": 11
  },
  {
    "id": "4a77339b-46df-5c4d-9c09-d47dc9923dae",
    "tarefa_id": "2f5d93f3-9c8e-51f2-bcfe-8b0e63718a36",
    "codigo": "1.12.1",
    "descricao": "SUBESTAÇÃO GRUPO A  - CABEAMENTO BAIXA TENSÃO ( Transformadores aos CPG')",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27452.69,
    "ordem": 12
  },
  {
    "id": "9a84409b-8900-5dc2-991f-c6ade934b094",
    "tarefa_id": "7fc437e0-520c-5a2d-a710-11782a2ec37d",
    "codigo": "1.13.1",
    "descricao": "SUBESTAÇÃO GRUPO A  - QUADROS ( CPG )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 35721.44,
    "ordem": 13
  },
  {
    "id": "d951cc75-35e6-541c-bb11-9fa92c3c1f90",
    "tarefa_id": "9703bb7f-6f9c-53c3-b559-3fe7c7599d39",
    "codigo": "1.14.1",
    "descricao": "ENTRADA / SE PMUC / SE GRUPO A  - ATERRAMENTO ( Haste + Cabeamento + Fechamentos  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 25619.67,
    "ordem": 14
  },
  {
    "id": "625ab3a7-b348-543f-b735-dcb181da183c",
    "tarefa_id": "5add1039-d180-5ff0-abf9-22877c669cad",
    "codigo": "2.1.1",
    "descricao": "GRUPO GERADOR PMUC  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 446509.17,
    "ordem": 15
  },
  {
    "id": "ffb4160d-ce34-5dd3-a811-15ccc3922042",
    "tarefa_id": "6a3eee1a-31f8-54c6-a658-7de57dd057f9",
    "codigo": "2.2.1",
    "descricao": "GRUPO GERADOR PMUC  - PAINEIS (  QTA's + Quadros reversão )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 389851.3,
    "ordem": 16
  },
  {
    "id": "6b4a6c21-53ac-57ac-87a6-4d3b88eef9ac",
    "tarefa_id": "a7ad0ef7-bfc6-5934-b4ad-85d9da2acbde",
    "codigo": "2.3.1",
    "descricao": "GRUPO GERADOR PMUC  - INFRAESTRUTURA  (  Eletrodutos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 60941.78,
    "ordem": 17
  },
  {
    "id": "9b7eb81b-a040-5d84-966e-8f00104aea54",
    "tarefa_id": "6e893673-c1c0-5887-aea4-6250969dfac4",
    "codigo": "2.4.1",
    "descricao": "GRUPO GERADOR PMUC  - CABEAMENTO BAIXA TENSÃO + COMANDO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 144019.27,
    "ordem": 18
  },
  {
    "id": "4dcd33b6-b7ab-528a-8894-183d2a8321a3",
    "tarefa_id": "d744e91d-8718-5608-82bd-4df3395e42a9",
    "codigo": "2.5.1",
    "descricao": "GRUPO GERADOR CONDOMINIO  - EQUIPAMENTO ( Gerador 500 Kva + Escapamento )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 431053.37,
    "ordem": 19
  },
  {
    "id": "91c85300-d164-56f5-af14-b70bbfbabc0b",
    "tarefa_id": "644b8ce8-8d45-5fd0-ba4c-73208a0c11b9",
    "codigo": "2.6.1",
    "descricao": "GRUPO GERADOR CONDOMINIO  - PAINEIS (  QTA EMERG + QTA QDC + QDG GERADOR )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 113013.61,
    "ordem": 20
  },
  {
    "id": "5dba881d-cfbe-5d2a-845a-a3dc99c2bdc7",
    "tarefa_id": "68f25f10-01c8-500b-969f-ad47e0a130b5",
    "codigo": "2.7.1",
    "descricao": "GRUPO GERADOR CONDOMINIO  - INFRAESTRUTURA  (  Eletrodutos )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 63561.89,
    "ordem": 21
  },
  {
    "id": "f097c9b1-777c-587e-9ff2-042930366c00",
    "tarefa_id": "cc31e44a-5b56-5f64-876a-65d95a065990",
    "codigo": "2.8.1",
    "descricao": "GRUPO GERADOR CONDOMINIO  - CABEAMENTO BAIXA TENSÃO + COMANDO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 175705.28,
    "ordem": 22
  },
  {
    "id": "28954b23-87f8-5e3e-b00f-e08249c2184c",
    "tarefa_id": "6efb97e5-855e-5be6-8b04-8a40d4cdb104",
    "codigo": "2.9.1",
    "descricao": "GRUPO GERADOR PMUC + CONDOMINIO  - ATERRAMENTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9800.56,
    "ordem": 23
  },
  {
    "id": "0e80cf8a-8dac-527a-98fa-133903e2b954",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.1",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 31375.93,
    "ordem": 24
  },
  {
    "id": "4245a386-f66a-5a13-ba41-44ac18463df6",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.2",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 31524.62,
    "ordem": 25
  },
  {
    "id": "cc2d65eb-7528-5fb8-b0f5-aa34c70de9f2",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.3",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 36467.27,
    "ordem": 26
  },
  {
    "id": "83aedd3a-6e72-5154-b048-d0c61be9d5a9",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.4",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 29816.74,
    "ordem": 27
  },
  {
    "id": "e35e2265-be96-52e0-a6d5-8d8a1da275ca",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.5",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 108459.59,
    "ordem": 28
  },
  {
    "id": "9267b06b-c560-5193-ad11-af541a8dce9a",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.6",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27705.78,
    "ordem": 29
  },
  {
    "id": "02f0209e-ceeb-5c98-93d9-3dcdf42e0949",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.7",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 36685.74,
    "ordem": 30
  },
  {
    "id": "95d43304-80f4-5c14-943a-10fcf3416d4f",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.8",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 32496.64,
    "ordem": 31
  },
  {
    "id": "b1fa5293-6561-5026-bf4c-cbf7b6919eec",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.9",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12656.01,
    "ordem": 32
  },
  {
    "id": "78f94092-dc60-5361-8cd3-8a2c17be9e64",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.10",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 7552.38,
    "ordem": 33
  },
  {
    "id": "18d8839c-1991-594b-b64c-2addd55e2934",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.11",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 8483.455,
    "ordem": 34
  },
  {
    "id": "6365c439-f958-5ae1-9ef5-4f6b9cde1d65",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.12",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8152.77,
    "ordem": 35
  },
  {
    "id": "cc4a1729-c988-571b-8f6b-6359c486bd48",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.13",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 5600.73,
    "ordem": 36
  },
  {
    "id": "a1ba02cb-f69d-5ff2-aa07-69af83b0ff44",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.14",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 11403.62,
    "ordem": 37
  },
  {
    "id": "66317999-1153-5ad0-bc00-16067b410059",
    "tarefa_id": "8c5ae9f4-8d20-59f4-b5f4-a3ad04887a05",
    "codigo": "3.1.15",
    "descricao": "INFRA ALIMENTAÇÃO ELÉTRICA - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )",
    "unidade": "VB",
    "quantidade_contratada": 50.0,
    "valor_unitario": 1122.4762,
    "ordem": 38
  },
  {
    "id": "4dc7f9cc-b631-5b71-a93d-b7b058709696",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.1",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6697.532,
    "ordem": 39
  },
  {
    "id": "56c0de4e-47f6-55d6-8ffe-db993ba8e960",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.2",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2921.2673,
    "ordem": 40
  },
  {
    "id": "9599097e-e0cc-5b3c-917d-3cc2d56d9a2e",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.3",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2707.516,
    "ordem": 41
  },
  {
    "id": "795ae26e-efd5-5507-9b96-4ff9d6f53b23",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.4",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4916.2791,
    "ordem": 42
  },
  {
    "id": "f1854503-a1af-525f-96ce-fc74db9784da",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.5",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 354941.8333,
    "ordem": 43
  },
  {
    "id": "a53977d0-893d-5735-b2ba-4057d662e4c1",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.6",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1068.7563,
    "ordem": 44
  },
  {
    "id": "bce9a718-9d65-53bd-9d78-6217b57dbb1b",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.7",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 855.0051,
    "ordem": 45
  },
  {
    "id": "4732e060-c870-5416-98df-17208d4d8690",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.8",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1389.3832,
    "ordem": 46
  },
  {
    "id": "86fb5e88-c72d-552f-8983-90d74a102b22",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.9",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4110.9563,
    "ordem": 47
  },
  {
    "id": "94a8b15c-7919-5880-bb2e-961e6524bd68",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.10",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 15904.9734,
    "ordem": 48
  },
  {
    "id": "3d3adee7-c1d8-5937-b785-3c8689497ca2",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.11",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 27510.12,
    "ordem": 49
  },
  {
    "id": "da48e8aa-5d80-54d8-a45d-2f9663bab2f9",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.12",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 57694.5772,
    "ordem": 50
  },
  {
    "id": "d837914b-9a8c-57db-8ffc-c783bba3942c",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.13",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 69525.4873,
    "ordem": 51
  },
  {
    "id": "ab9baf75-3db6-5aee-86f7-c34ef0a31c42",
    "tarefa_id": "b42bda49-c588-564b-9074-1548d573683f",
    "codigo": "3.2.14",
    "descricao": "CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 280489.228,
    "ordem": 52
  },
  {
    "id": "651a0d13-5ce1-51c0-abb9-70ec72740d10",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.1",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 25558.4126,
    "ordem": 53
  },
  {
    "id": "9faa0419-0e88-5de0-9944-1a09ca3f49e3",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.2",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23253.4032,
    "ordem": 54
  },
  {
    "id": "f84c6d75-f014-55cf-9baf-21834522c02c",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.3",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23253.4032,
    "ordem": 55
  },
  {
    "id": "9ef6dad8-ad95-5302-a777-539915b44a62",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.4",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23253.4032,
    "ordem": 56
  },
  {
    "id": "066b3276-6ab1-59c9-9429-784bf9fe7892",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.5",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 60458.8484,
    "ordem": 57
  },
  {
    "id": "f89ae035-11e6-5510-97df-aa002a7cd04b",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.6",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 25904.0839,
    "ordem": 58
  },
  {
    "id": "8e45480a-919c-5e62-a2d9-835bc019393f",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.7",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 26685.7226,
    "ordem": 59
  },
  {
    "id": "f1054155-f48f-5e41-9e84-e7bb050a9dcb",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.8",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 25904.0839,
    "ordem": 60
  },
  {
    "id": "54f1d7fe-6abd-556f-9167-9ac7a5dbbeb3",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.9",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 31808.1678,
    "ordem": 61
  },
  {
    "id": "f984359c-f9e0-5996-b1f8-6a72cbe04c7a",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.10",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 23621.4452,
    "ordem": 62
  },
  {
    "id": "fdf65e24-9a52-5e53-925e-7fbb8efffd24",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.11",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 5535.2739,
    "ordem": 63
  },
  {
    "id": "079a5ddb-461e-5d2b-99dd-b17f94c21725",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.12",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 5536.0419,
    "ordem": 64
  },
  {
    "id": "34e7b66e-72c9-545d-92a3-94ead9b0df24",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.13",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19725.1678,
    "ordem": 65
  },
  {
    "id": "f8ffa188-3f0e-553c-af9b-9dcd9c1d8c4a",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.14",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 10602.7226,
    "ordem": 66
  },
  {
    "id": "75840dd7-5004-58f5-bf74-e57f12f5ef97",
    "tarefa_id": "a0a1ab5c-0d5c-5e46-8348-03191edd3e9b",
    "codigo": "4.1.15",
    "descricao": "INFRA DISTRIBUIÇÃO ELÉTRICA - HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 5301.3613,
    "ordem": 67
  },
  {
    "id": "5ea9535f-1134-5534-bec5-21c57bc60726",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.1",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16149.8916,
    "ordem": 68
  },
  {
    "id": "963fe7a0-8e3e-532e-a19b-f829073af80f",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.2",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12464.2082,
    "ordem": 69
  },
  {
    "id": "ddd220db-81bb-5dc4-a204-bd564eefe09e",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.3",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12464.2082,
    "ordem": 70
  },
  {
    "id": "517df003-f075-5234-862a-a2a507f403d4",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.4",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12464.2082,
    "ordem": 71
  },
  {
    "id": "765e93c4-a3ec-5b92-a412-863f084c0ab2",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.5",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 46750.9414,
    "ordem": 72
  },
  {
    "id": "c49d3fe9-dc44-5382-b64c-6a0c4d975b68",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.6",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 22557.0499,
    "ordem": 73
  },
  {
    "id": "6c958427-4d9f-5cd0-8b07-9c4432cb17f2",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.7",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18371.3666,
    "ordem": 74
  },
  {
    "id": "e1762fc0-9005-572f-8e50-74d75c43ee0c",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.8",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 22557.0499,
    "ordem": 75
  },
  {
    "id": "4cf883ef-c184-5df8-a3f0-7c6c15485718",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.9",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 35114.0998,
    "ordem": 76
  },
  {
    "id": "874ee76a-a512-5b3e-bb99-60e46d8add22",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.10",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16742.7332,
    "ordem": 77
  },
  {
    "id": "1a79df1a-e1f7-5509-9409-99cd730923a5",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.11",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 4624.5249,
    "ordem": 78
  },
  {
    "id": "bca06733-c8f4-5757-a03e-7e832ce95601",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.12",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4778.5249,
    "ordem": 79
  },
  {
    "id": "c5ee693d-f224-5db0-ba51-ce5f1be27efc",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.13",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19114.0998,
    "ordem": 80
  },
  {
    "id": "2eea9ccb-de19-5ab7-992b-eb6d71668b55",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.14",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8371.3666,
    "ordem": 81
  },
  {
    "id": "0c90c8cd-a966-5947-b250-8bbd2206e58e",
    "tarefa_id": "72a0ebda-35f8-5104-b21d-de4c9b938517",
    "codigo": "4.2.15",
    "descricao": "CABEAMENTO DISTRIBUIÇÃO ELÉTRICA - HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4185.6833,
    "ordem": 82
  },
  {
    "id": "9a539e44-f70f-5b7e-80f3-0fc93f8efa13",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.1",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1763.6202,
    "ordem": 83
  },
  {
    "id": "a97543a0-0c8a-5541-9ba1-7a226d881995",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.2",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 84
  },
  {
    "id": "7e8151cc-ef48-5d81-9a4f-6b815fb9d70c",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.3",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 85
  },
  {
    "id": "46f50567-8741-514f-9e19-fcf8a508f14a",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.4",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 86
  },
  {
    "id": "06155775-55a9-5c88-bd3c-bf34a0ec4746",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.5",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3723.1982,
    "ordem": 87
  },
  {
    "id": "812865bc-eb81-5168-ac5c-bb50f889fd2e",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.6",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 88
  },
  {
    "id": "c5f2bcd3-2fea-5ac9-8843-aa0775578649",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.7",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 89
  },
  {
    "id": "bf9c0f3e-5903-5952-a14b-1fcfb8e92eb4",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.8",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 90
  },
  {
    "id": "2dbce2c5-5e97-515a-92c9-5e5ba9691935",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.9",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2155.5358,
    "ordem": 91
  },
  {
    "id": "10db17f4-b276-5b4e-8f5d-6b483dd17040",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.10",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3527.2404,
    "ordem": 92
  },
  {
    "id": "418218c3-5ad0-582c-8db4-3bde0b86366e",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.11",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 391.9156,
    "ordem": 93
  },
  {
    "id": "a694a591-bc47-571f-8a0c-9670af0262cd",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.12",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 391.9156,
    "ordem": 94
  },
  {
    "id": "c889c5f1-0e97-5251-b3f8-5a6ea6dc6961",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.13",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3919.156,
    "ordem": 95
  },
  {
    "id": "cbd933e8-674d-5768-9f23-2d04bd3ea631",
    "tarefa_id": "ea4eefdb-81de-5b39-8e36-cffc054668cf",
    "codigo": "4.3.14",
    "descricao": "ACABAMENTO DISTRIBUIÇÃO ELÉTRICA - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1371.7046,
    "ordem": 96
  },
  {
    "id": "01e82a43-5b67-55d7-ab3f-7be2f5aeab42",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.1",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12927.3084,
    "ordem": 97
  },
  {
    "id": "ed5d51aa-8317-576b-9f6e-f2b3b85727a2",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.2",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 15800.0436,
    "ordem": 98
  },
  {
    "id": "4add03ad-ec97-5288-8eb1-0f4cdf65eab3",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.3",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 15800.0436,
    "ordem": 99
  },
  {
    "id": "9b537395-82ca-5ea6-948d-869b3bd44612",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.4",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14363.676,
    "ordem": 100
  },
  {
    "id": "af21e889-c791-5843-8fa8-37f33058dc66",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.5",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 22981.8816,
    "ordem": 101
  },
  {
    "id": "bb14162b-ce6f-5f2c-9cf6-14e15f40feee",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.6",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 20109.1464,
    "ordem": 102
  },
  {
    "id": "34e1c9a7-45fa-5e67-97c7-e6470ac1c634",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.7",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 17236.4112,
    "ordem": 103
  },
  {
    "id": "c134867a-c17e-558e-8bfa-ac93f781219f",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.8",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8618.2056,
    "ordem": 104
  },
  {
    "id": "9a729e6d-123f-5166-af9b-8f9d6b85e8bd",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.9",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 43091.028,
    "ordem": 105
  },
  {
    "id": "c813edb2-36ce-5350-b411-84979989a50c",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.10",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 17236.4112,
    "ordem": 106
  },
  {
    "id": "73ac9a1c-712d-57d6-9efb-6a8ac0213889",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.11",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 1436.3676,
    "ordem": 107
  },
  {
    "id": "79c653e9-74d0-52e9-92b1-b427a02c858e",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.12",
    "descricao": "INSTALAÇÕES LUMINÁRIAS- PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1436.3676,
    "ordem": 108
  },
  {
    "id": "0dc83234-baee-5f53-9bef-4c9ca2dff1ec",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.13",
    "descricao": "INSTALAÇÕES LUMINÁRIAS- PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28727.352,
    "ordem": 109
  },
  {
    "id": "8daa793d-9956-56c7-9592-6840ba27b579",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.14",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14363.676,
    "ordem": 110
  },
  {
    "id": "7ababe1a-b1f0-5431-b2bb-a01c0c4b593b",
    "tarefa_id": "64d3c0c2-395d-5238-b850-e0fc915a4725",
    "codigo": "5.1.15",
    "descricao": "INSTALAÇÕES LUMINÁRIAS - HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2872.7352,
    "ordem": 111
  },
  {
    "id": "46febeb2-a39f-5276-985b-a453a7fc6305",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.1",
    "descricao": "QUADROS - SUBSOLO 04 + SUBSOLO 05 (QL 4 SUB - QF EX  4 SUB - QB DREN - QB IRRIG)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 38342.95,
    "ordem": 112
  },
  {
    "id": "1272ca0a-0377-51da-a8df-ac41c1330ee1",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.2",
    "descricao": "QUADROS - SUBSOLO 03 (QL 3 SUB - QF EX  3 SUB)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 22236.856,
    "ordem": 113
  },
  {
    "id": "7231ec99-0d5c-55fe-a509-e7aa87fdee78",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.3",
    "descricao": "QUADROS - SUBSOLO 02 (QL 2 SUB - QF EX  2 SUB)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 22391.109,
    "ordem": 114
  },
  {
    "id": "240488ba-04b5-5569-86bf-e0411364b27d",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.4",
    "descricao": "QUADROS - SUBSOLO 01 (QL 1 SUB - QF EX  1 SUB - QB ESPELHO)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28442.584,
    "ordem": 115
  },
  {
    "id": "730dd6b7-f6e4-5f26-a715-df6c11077fe5",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.5",
    "descricao": "QUADROS -TERREO (CM - QL GUA - QL TER - QD EMG - QB PRESS ESC E QB REC SEC)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 426460.3258,
    "ordem": 116
  },
  {
    "id": "75c5f23d-f748-5887-ad82-dbea500f7f67",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.6",
    "descricao": "QUADROS - SOBRESOLO 01 (QL 1 SOBR)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19052.4599,
    "ordem": 117
  },
  {
    "id": "ccefb8b1-cebd-5963-a8d9-cc9a974910f0",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.7",
    "descricao": "QUADROS - SOBRESOLO 02 (QL 2 SOBR E QDC)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 26673.2462,
    "ordem": 118
  },
  {
    "id": "f8f3ca49-a0e2-57d4-9bdd-e0a80fb3a15d",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.8",
    "descricao": "QUADROS - SOBRESOLO 03 (QL 3 SOBR E QB PISC)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 21882.0971,
    "ordem": 119
  },
  {
    "id": "035dc122-7d8b-5d97-ab9a-ffb5480b7534",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.9",
    "descricao": "QUADROS - LAZER (QL 3 SOBR E QB PISC)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28608.1188,
    "ordem": 120
  },
  {
    "id": "c2bf6d93-d1e8-5713-b4a7-64edfc4fe624",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.10",
    "descricao": "QUADROS - PANORAMICO (QL PAN - QL FAC - QEUDE)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 33792.4085,
    "ordem": 121
  },
  {
    "id": "f8baa965-bbce-5288-bb82-4de2765e5e3d",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.11",
    "descricao": "QL TIPO (36 VEZES)",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 6515.352,
    "ordem": 122
  },
  {
    "id": "7c1e44a0-a7d8-5c88-8a43-6fa2c4890adb",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.12",
    "descricao": "QUADROS - COBERTURA (QL COBERT - QB SUPERIOR)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12672.4931,
    "ordem": 123
  },
  {
    "id": "18902675-8f6c-5779-9c89-eac1aebec739",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.13",
    "descricao": "QUADROS MEZANINO (QL ROOFT - QFAC ROOTF - QL PAV 2)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 24845.4365,
    "ordem": 124
  },
  {
    "id": "2fc89919-d71b-5b82-9fd5-6418b49513ca",
    "tarefa_id": "ab99061d-0b87-54d9-9104-deeead2d578b",
    "codigo": "6.1.14",
    "descricao": "QUADROS CASA MAQUINAS (QL ROOFT - QFAC ROOTF - QL PAV 2)",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 33986.3129,
    "ordem": 125
  },
  {
    "id": "3e0bbabd-28d8-5666-855c-df97d73e0ea7",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.1",
    "descricao": "INFRA DADOS - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6556.0274,
    "ordem": 126
  },
  {
    "id": "5c66ce37-9aaa-5e28-af9f-7859f7e68a3f",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.2",
    "descricao": "INFRA DADOS  - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8334.0411,
    "ordem": 127
  },
  {
    "id": "04c98f9b-b946-588e-98d5-9e33933d1d35",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.3",
    "descricao": "INFRA DADOS  - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8334.0411,
    "ordem": 128
  },
  {
    "id": "54c43090-6c2e-5ff1-a049-d7f38e1a5f28",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.4",
    "descricao": "INFRA DADOS  - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 11112.0548,
    "ordem": 129
  },
  {
    "id": "098c1e14-e3ed-5b4e-8f34-df5667bc6a95",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.5",
    "descricao": "INFRA DADOS  - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 33890.0685,
    "ordem": 130
  },
  {
    "id": "c58140e2-7aea-5516-a4b2-1bc8e5a0bc89",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.6",
    "descricao": "INFRA DADOS  - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 15556.0274,
    "ordem": 131
  },
  {
    "id": "b16e4bd3-a31a-5c89-a3b1-7e3e19ae826b",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.7",
    "descricao": "INFRA DADOS - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16945.0343,
    "ordem": 132
  },
  {
    "id": "90a9f186-0bab-5a2b-862c-004d8914009a",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.8",
    "descricao": "INFRA DADOS  - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13745.0343,
    "ordem": 133
  },
  {
    "id": "4d08c703-a4d1-5c00-b5b7-98e523ba3446",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.9",
    "descricao": "INFRA DADOS  - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2778.0137,
    "ordem": 134
  },
  {
    "id": "6c05628b-91fa-584a-b8d4-79c0f0843891",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.10",
    "descricao": "INFRA DADOS  - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 4256.0274,
    "ordem": 135
  },
  {
    "id": "1cdd4c09-2f77-598c-ac4f-074d05f0ccba",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.11",
    "descricao": "INFRA DADOS  - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4556.0274,
    "ordem": 136
  },
  {
    "id": "5bb20ad3-e40e-504a-9631-788aaedba200",
    "tarefa_id": "0faddfbb-1654-5e75-9c7b-893eb8d655a8",
    "codigo": "7.1.12",
    "descricao": "INFRA DADOS  - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2778.0137,
    "ordem": 137
  },
  {
    "id": "bd6f8315-6439-5921-8b80-a09d347a594b",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.1",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - PRUMADA VERTICAL ( Dividida em vãos - 48 vãos do 1° subsolo ate a coberta  )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 14236.9293,
    "ordem": 138
  },
  {
    "id": "cbc2446f-b1c5-54d0-8451-8600da324f88",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.2",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 04 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6833.7261,
    "ordem": 139
  },
  {
    "id": "95702887-43ab-5325-9615-d65b307cde2d",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.3",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 03 ( RECALQUE DRENAGEM + DRENO AR CONDICIONADO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6833.7261,
    "ordem": 140
  },
  {
    "id": "323583f4-c15e-556e-84a7-0ec81dd25f37",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.4",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 02 (  DRENO AR CONDICIONADO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2401.05,
    "ordem": 141
  },
  {
    "id": "d20f4cb3-cf88-56f5-95d7-716b03abbd49",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.5",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SUBSOLO 01 (  DRENO AR CONDICIONADO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2401.05,
    "ordem": 142
  },
  {
    "id": "dd5ee57c-a30c-54fa-9d53-dce90a7690a9",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.6",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 68337.2605,
    "ordem": 143
  },
  {
    "id": "bd1cc002-5de4-5123-b6fc-1ef68bc6d3b7",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.7",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13667.4521,
    "ordem": 144
  },
  {
    "id": "78f8fbfe-c044-5130-b726-2b255cbcb2e6",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.8",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27334.9042,
    "ordem": 145
  },
  {
    "id": "5e7683e5-d3a1-503d-aafe-50f85f94fd2e",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.9",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13667.4521,
    "ordem": 146
  },
  {
    "id": "4933dc49-e853-541f-a0d8-53bda2986aca",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.10",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 68337.2605,
    "ordem": 147
  },
  {
    "id": "80edb778-438b-5706-a6dd-32a1e72bedad",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.11",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27334.9042,
    "ordem": 148
  },
  {
    "id": "d33715a5-118b-5ca8-96d0-2e4abb6a0b1d",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.12",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - 1° PAVIMENTO ( TIPO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 27334.9042,
    "ordem": 149
  },
  {
    "id": "d2d15087-035b-5e9a-a342-603b84bf65d6",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.13",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - PAVIMENTO TIPO  ( 2° AO 36° PAV )",
    "unidade": "VB",
    "quantidade_contratada": 35.0,
    "valor_unitario": 10933.9617,
    "ordem": 150
  },
  {
    "id": "bcf43030-4a69-5039-b058-8979a4a41c41",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.14",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13667.4521,
    "ordem": 151
  },
  {
    "id": "92226480-9cbc-537d-98d3-78aeb46b7df0",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.15",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13667.4521,
    "ordem": 152
  },
  {
    "id": "45f5a8b5-4731-5622-87b2-7a5bb9d037f6",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.16",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - CASA DE MAQUINA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 13667.4521,
    "ordem": 153
  },
  {
    "id": "7b3e95d4-c430-5bd5-9d7e-66ca9fc00e8c",
    "tarefa_id": "0ad64eaa-4d23-5d5e-9cc6-5039ca51510b",
    "codigo": "8.1.17",
    "descricao": "TUBOS E CONEXÕES - AGUAS PLUVIAIS - HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6833.7261,
    "ordem": 154
  },
  {
    "id": "4a63f6c8-d51f-587a-bc72-121eaa7f66cf",
    "tarefa_id": "b31a850f-361e-5dcf-a051-fbedd22606a0",
    "codigo": "8.2.1",
    "descricao": "INSTALAÇÃO DE BOMBAS - DRENAGEM - AGUAS PLUVIAIS - SUBSOLO 4 ( TUBOS, CONEXÕES E VALVULAS  )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 50633.8,
    "ordem": 155
  },
  {
    "id": "5f4f45ea-c804-5a8e-8d52-a56b24968597",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.1",
    "descricao": "TUBOS E CONEXÕES - ESGOTO - PRUMADA VERTICAL ( Dividida em vãos entre pavimentos )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 15817.7813,
    "ordem": 156
  },
  {
    "id": "f50d245e-f074-5638-9184-8f7a28874cb4",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.2",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9490.6688,
    "ordem": 157
  },
  {
    "id": "e7fd1a95-d4aa-5762-92c3-257236e3948f",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.3",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9490.6688,
    "ordem": 158
  },
  {
    "id": "20e27862-ff7b-501d-880d-6653dedfa261",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.4",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9490.6688,
    "ordem": 159
  },
  {
    "id": "9ff8ccd5-5409-5d03-9bf4-60512c986132",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.5",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9490.6688,
    "ordem": 160
  },
  {
    "id": "c0a9a6b9-eada-5e9d-a600-7cc101ee3cb3",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.6",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 75925.3504,
    "ordem": 161
  },
  {
    "id": "56d645f5-6af6-5159-a013-0d0c177a602e",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.7",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18981.3376,
    "ordem": 162
  },
  {
    "id": "b0d5bbf6-cd16-593d-b2cd-30db807f8c76",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.8",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28472.0064,
    "ordem": 163
  },
  {
    "id": "f018dcc4-8990-5847-b5af-09282a41cda4",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.9",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18981.3376,
    "ordem": 164
  },
  {
    "id": "836a7285-219c-5d86-8b37-1af1d9a2dd8e",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.10",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28472.0064,
    "ordem": 165
  },
  {
    "id": "b406ef9a-1b7d-57df-9d9a-247eabb3df39",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.11",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18981.3376,
    "ordem": 166
  },
  {
    "id": "bd5240e3-3e9d-5286-aefe-6e8dff4f8fb9",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.12",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - 1° PAVIMENTO ( TIPO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 37962.6752,
    "ordem": 167
  },
  {
    "id": "b057cf47-95c0-503e-80bd-f45b7fe074b8",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.13",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - PAVIMENTO TIPO  ( 2° AO 36° PAV )",
    "unidade": "VB",
    "quantidade_contratada": 35.0,
    "valor_unitario": 22777.6051,
    "ordem": 168
  },
  {
    "id": "da4c9c3e-0c4f-5ab6-9d2e-37627c6d731b",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.14",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 37962.6752,
    "ordem": 169
  },
  {
    "id": "12b7da83-f71c-58c0-9bfc-7e6e3db98fbb",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.15",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18981.3376,
    "ordem": 170
  },
  {
    "id": "fb4c7c2e-e8e8-54c7-a23e-6419d1867052",
    "tarefa_id": "cfed1034-3d29-53b1-93d8-1467ff8d2224",
    "codigo": "9.1.16",
    "descricao": "TUBOS E CONEXÕES - ESGOTO  - CASA DE MAQUINA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 18981.3376,
    "ordem": 171
  },
  {
    "id": "f24604bf-fd49-535f-bffc-dea4ee34c4ec",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.1",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA - PRUMADA VERTICAL ( Dividida em vãos )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 7406.6454,
    "ordem": 172
  },
  {
    "id": "1ced5bc9-92fe-5fff-a03d-fd266bda0fb5",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.2",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 173
  },
  {
    "id": "368dd8aa-d397-523b-afc0-8fb8035c359c",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.3",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 174
  },
  {
    "id": "9bd8e4d3-1c72-5fdb-85c2-7bf07ac2f2a1",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.4",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 175
  },
  {
    "id": "cca1b2d9-df44-557c-ae42-45f9e0b0f329",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.5",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 176
  },
  {
    "id": "8224f075-5eb1-52be-9cfc-29c75ad3b338",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.6",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 71103.796,
    "ordem": 177
  },
  {
    "id": "cb7e58eb-b771-5cd6-9d65-2d77a6b00adc",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.7",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 0.0,
    "ordem": 178
  },
  {
    "id": "130c1050-ae9d-5ffe-9b0a-80eae4e4e443",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.8",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 179
  },
  {
    "id": "52250556-c2b2-5c77-9364-770c03cc8c51",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.9",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28441.5184,
    "ordem": 180
  },
  {
    "id": "bda83591-4670-5cfe-970d-0044045779a9",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.10",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 21331.1388,
    "ordem": 181
  },
  {
    "id": "4c217589-6a83-572e-9008-218fdb08c2ff",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.11",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 14220.7592,
    "ordem": 182
  },
  {
    "id": "83d813cc-e3d8-521d-88c9-e9b2c558c111",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.12",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 21331.1388,
    "ordem": 183
  },
  {
    "id": "9ca92f98-4939-5cd5-9c45-3ae083308404",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.13",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28441.5184,
    "ordem": 184
  },
  {
    "id": "ae17f3a3-9557-563f-89a1-de4add05cce5",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.14",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 7110.3796,
    "ordem": 185
  },
  {
    "id": "4670e03e-4507-5687-b45a-cd3ec649451b",
    "tarefa_id": "e0464d94-5a39-5060-b5cf-ef37b6621773",
    "codigo": "10.1.15",
    "descricao": "TUBOS E CONEXÕES - HIDRÁULICA  - CASA DE MAQUINA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 56883.0368,
    "ordem": 186
  },
  {
    "id": "3054e23e-547a-54eb-ae2e-df7dc0f1741c",
    "tarefa_id": "12f8189e-4f46-5b06-8dff-1627f02b22f0",
    "codigo": "10.2.1",
    "descricao": "TUBOS E CONEXÕES - HIDRAULICA  - PAVIMENTO TIPO  ( 1° AO 36° PAV )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 16806.618,
    "ordem": 187
  },
  {
    "id": "79b1e69a-88f3-52c6-8e80-8a30d2d71aea",
    "tarefa_id": "12f8189e-4f46-5b06-8dff-1627f02b22f0",
    "codigo": "10.2.2",
    "descricao": "TUBOS E CONEXÕES - HIDRAULICA  - COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 39821.6366,
    "ordem": 188
  },
  {
    "id": "031a30ae-b712-5559-b78a-0f90182f7fe1",
    "tarefa_id": "12f8189e-4f46-5b06-8dff-1627f02b22f0",
    "codigo": "10.2.3",
    "descricao": "TUBOS E CONEXÕES - HIDRAULICA  - CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28384.4444,
    "ordem": 189
  },
  {
    "id": "6ac0d4af-40d9-5c76-8854-c306533e72e6",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.1",
    "descricao": "CONJUNTO HIDROMETROS APARTAMENTOS ( VALVULAS E CONEXÕES )",
    "unidade": "VB",
    "quantidade_contratada": 37.0,
    "valor_unitario": 2162.66,
    "ordem": 190
  },
  {
    "id": "dc997ba7-2432-5c9b-b19a-19bdbea22ae5",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.2",
    "descricao": "CONJUNTO BOMBAS RECALQUE",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 187034.64,
    "ordem": 191
  },
  {
    "id": "8e46bc28-017e-5a3a-9313-c56128b2fc18",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.3",
    "descricao": "CONJUNTO BOMBAS PRESSURIZAÇÃO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 62990.63,
    "ordem": 192
  },
  {
    "id": "4c113034-029a-594f-aa57-a1e2ffb5ce33",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.4",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA F )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 55093.64,
    "ordem": 193
  },
  {
    "id": "78227db1-4078-5228-888d-c249e3f1e723",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.5",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA G )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 55093.64,
    "ordem": 194
  },
  {
    "id": "8e34274f-6f7f-5041-b8ac-4f8de5ea65f1",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.6",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA CONDOMINIO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 82225.0,
    "ordem": 195
  },
  {
    "id": "4373c9ee-e497-5ca8-a8d3-1f251fe6dff4",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.7",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA B )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 58943.53,
    "ordem": 196
  },
  {
    "id": "6bf2315f-38b5-544a-b6a3-48588f3b3d10",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.8",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA C )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 58505.23,
    "ordem": 197
  },
  {
    "id": "804f535d-9f99-55b9-bf00-d37d4a32d128",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.9",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA D )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 58527.58,
    "ordem": 198
  },
  {
    "id": "a7a02244-0a6e-5e15-924d-d9b545a625a8",
    "tarefa_id": "d9297fa3-3bdd-54c3-99e2-ec9e5063d8ff",
    "codigo": "10.3.10",
    "descricao": "CONJUNTO ESTAÇÃO REDUTORA DE PRESSÃO ( SISTEMA E )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 58587.95,
    "ordem": 199
  },
  {
    "id": "d88e55dd-b6f8-552e-a75e-ea213628c5e1",
    "tarefa_id": "",
    "codigo": "12.1.1",
    "descricao": "TUBOS E CONEXÕES ( PVC SOLDAVEL E PPR )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 52263.32,
    "ordem": 200
  },
  {
    "id": "d88e55dd-b6f8-552e-a75e-ea213628c5e1",
    "tarefa_id": "",
    "codigo": "12.1.1",
    "descricao": "ACABAMENTOS ( RALOS DE FUNDO, ASPIRAÇÃO E RETORNO )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8096.06,
    "ordem": 201
  },
  {
    "id": "d88e55dd-b6f8-552e-a75e-ea213628c5e1",
    "tarefa_id": "",
    "codigo": "12.1.1",
    "descricao": "BARRILHETES E BOMBAS ( BOMBAS FILTROS E VALVULAS )",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 68415.37,
    "ordem": 202
  },
  {
    "id": "0b66577a-7142-5e88-ac5e-e891c0cab18b",
    "tarefa_id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "codigo": "13.1.1",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2340.0793,
    "ordem": 203
  },
  {
    "id": "47c5c92d-2d00-5314-926c-94c8a5200529",
    "tarefa_id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "codigo": "13.1.2",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3240.1098,
    "ordem": 204
  },
  {
    "id": "398e0cdc-d1c5-596a-b57e-7d32ada8a0b7",
    "tarefa_id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "codigo": "13.1.3",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3240.1098,
    "ordem": 205
  },
  {
    "id": "62512a79-490f-58c5-9574-70270aa2ad6e",
    "tarefa_id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "codigo": "13.1.4",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8640.2928,
    "ordem": 206
  },
  {
    "id": "87dcd99d-c9d1-5945-a71f-d869c0cd1b1a",
    "tarefa_id": "38ae47be-2c92-57e5-ab9d-4a4ddd77605a",
    "codigo": "13.1.5",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO CASA DE MAQ",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 540.0183,
    "ordem": 207
  },
  {
    "id": "a3e03c2d-4209-5a48-a269-ff47595b093b",
    "tarefa_id": "7398d188-1fff-598a-bbd4-374d4a412c18",
    "codigo": "13.2.1",
    "descricao": "LOUÇAS E METAIS - PAVIMENTO TIPO 1 AO 36",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 2707.1745,
    "ordem": 208
  },
  {
    "id": "a4929bb8-a0e5-51b6-9787-d4f49b4f2c57",
    "tarefa_id": "7398d188-1fff-598a-bbd4-374d4a412c18",
    "codigo": "13.2.2",
    "descricao": "LOUÇAS E METAIS - COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 10828.698,
    "ordem": 209
  },
  {
    "id": "6f2d8f07-0f69-5eec-b665-fda61c1dea56",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.1",
    "descricao": "TUBOS E CONEXÕES - HIDRANTE - PRUMADA VERTICAL ( Dividida em vãos )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 2146.2149,
    "ordem": 210
  },
  {
    "id": "12818b44-e5d5-5dcb-a269-e275c0f0d831",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.2",
    "descricao": "TUBOS E CONEXÕES - HIDRANTE - PAV TIPO ( 1 ao 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 1632.9719,
    "ordem": 211
  },
  {
    "id": "53075b81-fabc-5d88-b289-11179ccdd941",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.3",
    "descricao": "TUBOS E CONEXÕES - HIDRANTE - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4242.551,
    "ordem": 212
  },
  {
    "id": "f13699ac-c999-50a3-9837-352c9a4068fc",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.4",
    "descricao": "TUBOS E CONEXÕES - HIDRANTE - PAV ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2121.2755,
    "ordem": 213
  },
  {
    "id": "d76449d9-d00c-5916-86d1-9a670f0c0701",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.5",
    "descricao": "TUBOS E CONEXÕES - HIDRANTE - PAV CASA DE MAQUINA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2121.2755,
    "ordem": 214
  },
  {
    "id": "4f2f930c-103a-5a0b-b93f-ba051e1f6f51",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.6",
    "descricao": "CAIXAS E ACESSORIOS - HIDRANTE - SUBSOLO 4 A0 PAV TIPO 36",
    "unidade": "VB",
    "quantidade_contratada": 46.0,
    "valor_unitario": 3276.4,
    "ordem": 215
  },
  {
    "id": "aafac05c-94a5-5d33-84d4-0e0570bc4f6f",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.7",
    "descricao": "CAIXAS E ACESSORIOS - HIDRANTE - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 11696.8976,
    "ordem": 216
  },
  {
    "id": "93f08f0a-ab0e-593f-9b98-39498c709f37",
    "tarefa_id": "26241fdc-34c2-5244-a734-c672f422c2b1",
    "codigo": "14.1.8",
    "descricao": "CAIXAS E ACESSORIOS - HIDRANTE - PAV ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 7786.2584,
    "ordem": 217
  },
  {
    "id": "d73b7fcc-704e-5b70-a33e-daaed832a157",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.1",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PRUMADA VERTICAL ( Dividida por  vãos entre pavimentos  )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 6452.25,
    "ordem": 218
  },
  {
    "id": "1685de5d-ddc3-5f3f-ad4f-13aebb66b9ac",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.2",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - CONJUNTO VALVULA REDUTORA DE PRESSÃO",
    "unidade": "VB",
    "quantidade_contratada": 2.0,
    "valor_unitario": 57547.03,
    "ordem": 219
  },
  {
    "id": "ae9a1715-2ed6-531a-b885-601d1bf9b4e1",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.3",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 4",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 80022.777,
    "ordem": 220
  },
  {
    "id": "44d2ade9-c8a2-578e-b4d3-05ecc7306a25",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.4",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 3",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 80022.777,
    "ordem": 221
  },
  {
    "id": "528be6e3-1e2b-5df8-9ff2-f0cabaa0d244",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.5",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 2",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 80022.777,
    "ordem": 222
  },
  {
    "id": "a93e95a6-a920-5e97-85f3-35c736baaf07",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.6",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SUBSOLO 1",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 80022.777,
    "ordem": 223
  },
  {
    "id": "21461907-8373-5e93-b444-5868d11b3cfc",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.7",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 83223.6881,
    "ordem": 224
  },
  {
    "id": "950aec49-c1d5-50a8-bd1d-9b600eff7a33",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.8",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 1",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 72020.4993,
    "ordem": 225
  },
  {
    "id": "f1c7e4b1-d399-5dcd-9abb-bafce5cda3af",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.9",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 2",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 64018.2216,
    "ordem": 226
  },
  {
    "id": "c91d0c9e-0010-5705-9b24-c249fe0c3a78",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.10",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO SOBRESOLO 3",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 56015.9439,
    "ordem": 227
  },
  {
    "id": "12038866-e723-5db4-a19d-68b05bb007cd",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.11",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 24006.8331,
    "ordem": 228
  },
  {
    "id": "7b26f95a-d2f6-517c-940b-f0e0b15a753e",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.12",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 32009.1108,
    "ordem": 229
  },
  {
    "id": "20cf54d8-e226-50ce-883e-dd5738a10bcc",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.13",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO TIPO ( 1° ao 36° )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 1863.2189,
    "ordem": 230
  },
  {
    "id": "3c856360-a9df-51a6-bc16-f48a27804c3d",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.14",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6401.8222,
    "ordem": 231
  },
  {
    "id": "8be0bbe4-746d-5776-bdfb-f3079982462a",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.15",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO ROOFTOP + MEZANINO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28942.9184,
    "ordem": 232
  },
  {
    "id": "9eeceaae-7f00-5661-b87b-2e03b0173f3f",
    "tarefa_id": "b202e016-c034-5355-bbb7-f701c5403262",
    "codigo": "14.2.16",
    "descricao": "TUBOS E CONEXÕES - SPRINKLER - PAVIMENTO CASA DE MAQUINA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 24006.8331,
    "ordem": 233
  },
  {
    "id": "004214fd-538d-5ff4-9b80-42a78924382e",
    "tarefa_id": "b4cf8639-0e69-5983-8a36-312b89d775eb",
    "codigo": "14.3.1",
    "descricao": "BARRILHETE BOMBAS - CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 139226.83,
    "ordem": 234
  },
  {
    "id": "02750ec7-bd4d-5ab5-8b94-8f281b915c74",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.1",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3026.571,
    "ordem": 235
  },
  {
    "id": "86b9fcc2-fd6c-52a1-ae50-2946a4a71800",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.2",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1815.9426,
    "ordem": 236
  },
  {
    "id": "a8613419-25a7-5a65-a1c8-4acc0a80088f",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.3",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1815.9426,
    "ordem": 237
  },
  {
    "id": "ee1d6ce6-fb90-5902-a634-96c5700950ed",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.4",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1815.9426,
    "ordem": 238
  },
  {
    "id": "9080eaa1-f553-5a23-a56b-cd3bb74e2095",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.5",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3631.8852,
    "ordem": 239
  },
  {
    "id": "b5584a2e-8b03-56d4-a4a6-02fe5a4a80cb",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.6",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2421.2568,
    "ordem": 240
  },
  {
    "id": "a02c980f-99da-5bd3-84c4-4ca604127cb7",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.7",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2421.2568,
    "ordem": 241
  },
  {
    "id": "1b926dd4-273c-5b90-9e15-e4a9b9e4d966",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.8",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1815.9426,
    "ordem": 242
  },
  {
    "id": "20ac9f3a-917b-5471-a443-d14e0e7a84b8",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.9",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2421.2568,
    "ordem": 243
  },
  {
    "id": "d33f85c9-92ea-5ca0-8701-fb3ffb90f749",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.10",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1815.9426,
    "ordem": 244
  },
  {
    "id": "cd974d48-aaed-5fb4-90ce-a2c816ae2bac",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.11",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 907.9713,
    "ordem": 245
  },
  {
    "id": "e25ab43f-765e-58a2-94c2-2115ef2e12ca",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.12",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO- PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1210.6284,
    "ordem": 246
  },
  {
    "id": "a4552ed5-8311-53ac-86e6-b3013a631c72",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.13",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO- PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3026.571,
    "ordem": 247
  },
  {
    "id": "36cbdb70-b489-5b97-8d51-71c696360b3c",
    "tarefa_id": "6f4e6ae4-1fab-5ce6-891a-6fb2658a053b",
    "codigo": "15.1.14",
    "descricao": "INSTALAÇÕES SINALIZAÇÃO - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 605.3142,
    "ordem": 248
  },
  {
    "id": "02750ec7-bd4d-5ab5-8b94-8f281b915c74",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.1",
    "descricao": "INSTALAÇÕES EXTINTORES - SUBSOLO 04 + SUBSOLO 05",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3052.8415,
    "ordem": 249
  },
  {
    "id": "86b9fcc2-fd6c-52a1-ae50-2946a4a71800",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.2",
    "descricao": "INSTALAÇÕES EXTINTORES - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2442.2732,
    "ordem": 250
  },
  {
    "id": "a8613419-25a7-5a65-a1c8-4acc0a80088f",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.3",
    "descricao": "INSTALAÇÕES EXTINTORES - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2442.2732,
    "ordem": 251
  },
  {
    "id": "ee1d6ce6-fb90-5902-a634-96c5700950ed",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.4",
    "descricao": "INSTALAÇÕES EXTINTORES - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2442.2732,
    "ordem": 252
  },
  {
    "id": "9080eaa1-f553-5a23-a56b-cd3bb74e2095",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.5",
    "descricao": "INSTALAÇÕES EXTINTORES - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3663.4098,
    "ordem": 253
  },
  {
    "id": "b5584a2e-8b03-56d4-a4a6-02fe5a4a80cb",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.6",
    "descricao": "INSTALAÇÕES EXTINTORES - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3052.8415,
    "ordem": 254
  },
  {
    "id": "a02c980f-99da-5bd3-84c4-4ca604127cb7",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.7",
    "descricao": "INSTALAÇÕES EXTINTORES - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2442.2732,
    "ordem": 255
  },
  {
    "id": "1b926dd4-273c-5b90-9e15-e4a9b9e4d966",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.8",
    "descricao": "INSTALAÇÕES EXTINTORES - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2442.2732,
    "ordem": 256
  },
  {
    "id": "20ac9f3a-917b-5471-a443-d14e0e7a84b8",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.9",
    "descricao": "INSTALAÇÕES EXTINTORES - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2260.8,
    "ordem": 257
  },
  {
    "id": "d33f85c9-92ea-5ca0-8701-fb3ffb90f749",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.10",
    "descricao": "INSTALAÇÕES EXTINTORES - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1831.7049,
    "ordem": 258
  },
  {
    "id": "cd974d48-aaed-5fb4-90ce-a2c816ae2bac",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.11",
    "descricao": "INSTALAÇÕES EXTINTORES - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 853.0525,
    "ordem": 259
  },
  {
    "id": "e25ab43f-765e-58a2-94c2-2115ef2e12ca",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.12",
    "descricao": "INSTALAÇÕES EXTINTORES- PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1221.1366,
    "ordem": 260
  },
  {
    "id": "a4552ed5-8311-53ac-86e6-b3013a631c72",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.13",
    "descricao": "INSTALAÇÕES EXTINTORES- PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1831.7049,
    "ordem": 261
  },
  {
    "id": "36cbdb70-b489-5b97-8d51-71c696360b3c",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.14",
    "descricao": "INSTALAÇÕES EXTINTORES - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1221.1366,
    "ordem": 262
  },
  {
    "id": "767bdf45-869f-5c07-881f-ba0acd23dced",
    "tarefa_id": "d068b384-84e7-5bce-80fa-c738c19c0391",
    "codigo": "15.1.15",
    "descricao": "INSTALAÇÕES EXTINTORES - HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 28880.09,
    "ordem": 263
  },
  {
    "id": "fd9c19af-5509-5695-a0c7-4450826b1a5f",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.1",
    "descricao": "INFRA SDAI - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 11216.0167,
    "ordem": 264
  },
  {
    "id": "36cb7abf-fd89-5df7-9706-1d1b9efed6ab",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.2",
    "descricao": "INFRA SDAI - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9613.7286,
    "ordem": 265
  },
  {
    "id": "05555ec9-35e4-53c7-8b32-0b0414998cdc",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.3",
    "descricao": "INFRA SDAI - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9613.7286,
    "ordem": 266
  },
  {
    "id": "0964c963-218a-5b01-9495-d518a733572f",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.4",
    "descricao": "INFRA SDAI - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 9613.7286,
    "ordem": 267
  },
  {
    "id": "647cd623-ce98-5645-9d12-e487db85ecc6",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.5",
    "descricao": "INFRA SDAI - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16022.881,
    "ordem": 268
  },
  {
    "id": "9d9b7ab7-2577-59a0-94b7-c6e9d51e43c6",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.6",
    "descricao": "INFRA SDAI - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8011.4405,
    "ordem": 269
  },
  {
    "id": "a9941482-997e-5d3d-9902-8f79bd4f0678",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.7",
    "descricao": "INFRA SDAI - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4806.8643,
    "ordem": 270
  },
  {
    "id": "901a4560-a053-5b55-9e52-53e4da879108",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.8",
    "descricao": "INFRA SDAI - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4806.8643,
    "ordem": 271
  },
  {
    "id": "4f9f975b-daec-5ad3-a021-cb2497b8ee64",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.9",
    "descricao": "INFRA SDAI - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4806.8643,
    "ordem": 272
  },
  {
    "id": "d9c47e6d-a46a-52f3-9b44-951efa532673",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.10",
    "descricao": "INFRA SDAI - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4806.8643,
    "ordem": 273
  },
  {
    "id": "31fe926e-83b1-595f-87ef-f9602543e5ba",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.11",
    "descricao": "INFRA SDAI - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 1098.2991,
    "ordem": 274
  },
  {
    "id": "d1134c75-df55-5c16-8226-0aa244299690",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.12",
    "descricao": "INFRA  SDAI - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2396.5982,
    "ordem": 275
  },
  {
    "id": "ba53c1fd-1a28-5412-93c4-3a9cf34b1194",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.13",
    "descricao": "INFRA SDAI - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3594.8973,
    "ordem": 276
  },
  {
    "id": "c5527f66-f73e-537a-b8c0-3505a36b3391",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.14",
    "descricao": "INFRA SDAI - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2931.5982,
    "ordem": 277
  },
  {
    "id": "67692ce9-8b71-5a31-bd98-6327f1ea8049",
    "tarefa_id": "70760d7b-1c73-559a-a0f4-4b9d215a8dc5",
    "codigo": "16.1.15",
    "descricao": "INFRA SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 166.905,
    "ordem": 278
  },
  {
    "id": "a634a995-94f9-59f3-8a4e-5db991a99fca",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.1",
    "descricao": "CABEAMENTO SDAI - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3640.3314,
    "ordem": 279
  },
  {
    "id": "224f3f82-2acc-558d-8990-54a2ac515c75",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.2",
    "descricao": "CABEAMENTO SDAI - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3640.3314,
    "ordem": 280
  },
  {
    "id": "0834a9e8-a71e-5e23-b94d-d56dc86e0dd8",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.3",
    "descricao": "CABEAMENTO SDAI - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4247.0533,
    "ordem": 281
  },
  {
    "id": "a194f156-8e7c-565e-837a-35fe4325a44b",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.4",
    "descricao": "CABEAMENTO SDAI - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4247.0533,
    "ordem": 282
  },
  {
    "id": "5c009284-3906-5aef-a9d9-f3a6af7963b0",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.5",
    "descricao": "CABEAMENTO SDAI - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6188.5634,
    "ordem": 283
  },
  {
    "id": "bacb9b36-192d-55ab-b17a-73ac7c11c8aa",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.6",
    "descricao": "CABEAMENTO SDAI - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3640.3314,
    "ordem": 284
  },
  {
    "id": "15272427-99d0-558f-b80e-45d8c7eb754b",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.7",
    "descricao": "CABEAMENTO SDAI - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1820.1657,
    "ordem": 285
  },
  {
    "id": "90e69873-43a4-5d42-a552-771e92bb487a",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.8",
    "descricao": "CABEAMENTO SDAI - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1820.1657,
    "ordem": 286
  },
  {
    "id": "cfae1911-2cd9-5353-af83-0d8afb1b8ead",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.9",
    "descricao": "CABEAMENTO SDAI - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1820.1657,
    "ordem": 287
  },
  {
    "id": "4c239c7b-b4b2-505d-a532-284d8a90fe71",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.10",
    "descricao": "CABEAMENTO SDAI - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1820.1657,
    "ordem": 288
  },
  {
    "id": "02879a85-a3ea-5fd9-bfc9-ddcb72e68662",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.11",
    "descricao": "CABEAMENTO SDAI - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 364.4914,
    "ordem": 289
  },
  {
    "id": "e2b46b0d-81d3-5c9a-a42b-93f108810f11",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.12",
    "descricao": "CABEAMENTO  SDAI - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 606.7219,
    "ordem": 290
  },
  {
    "id": "2dbab32b-561d-5655-a100-13b451fd4bba",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.13",
    "descricao": "CABEAMENTO SDAI - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1820.1657,
    "ordem": 291
  },
  {
    "id": "1d65d9f6-4d2e-5e2d-b530-8bb33ee37264",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.14",
    "descricao": "CABEAMENTO SDAI - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1213.4438,
    "ordem": 292
  },
  {
    "id": "0f347014-3c75-5af4-a510-4919fdc6efcc",
    "tarefa_id": "4c66b511-ae0e-557a-bbb2-2f94617e5b82",
    "codigo": "16.2.15",
    "descricao": "CABEAMENTO SDAI - INFRA VERTICAL ( DIVIDIDO POR VÃOS )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 139.0404,
    "ordem": 293
  },
  {
    "id": "a634a995-94f9-59f3-8a4e-5db991a99fca",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.1",
    "descricao": "EQUIPAMENTOS SDAI - SUBSOLO 04",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16532.9296,
    "ordem": 294
  },
  {
    "id": "224f3f82-2acc-558d-8990-54a2ac515c75",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.2",
    "descricao": "EQUIPAMENTOS SDAI - SUBSOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12399.6972,
    "ordem": 295
  },
  {
    "id": "0834a9e8-a71e-5e23-b94d-d56dc86e0dd8",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.3",
    "descricao": "EQUIPAMENTOS SDAI - SUBSOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12399.6972,
    "ordem": 296
  },
  {
    "id": "a194f156-8e7c-565e-837a-35fe4325a44b",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.4",
    "descricao": "EQUIPAMENTOS SDAI - SUBSOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 12399.6972,
    "ordem": 297
  },
  {
    "id": "5c009284-3906-5aef-a9d9-f3a6af7963b0",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.5",
    "descricao": "EQUIPAMENTOS SDAI - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 20666.162,
    "ordem": 298
  },
  {
    "id": "bacb9b36-192d-55ab-b17a-73ac7c11c8aa",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.6",
    "descricao": "EQUIPAMENTOS SDAI - SOBRESOLO 01",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 16532.9296,
    "ordem": 299
  },
  {
    "id": "15272427-99d0-558f-b80e-45d8c7eb754b",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.7",
    "descricao": "EQUIPAMENTOS SDAI - SOBRESOLO 02",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6199.8486,
    "ordem": 300
  },
  {
    "id": "90e69873-43a4-5d42-a552-771e92bb487a",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.8",
    "descricao": "EQUIPAMENTOS SDAI - SOBRESOLO 03",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6199.8486,
    "ordem": 301
  },
  {
    "id": "cfae1911-2cd9-5353-af83-0d8afb1b8ead",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.9",
    "descricao": "EQUIPAMENTOS SDAI - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6199.8486,
    "ordem": 302
  },
  {
    "id": "4c239c7b-b4b2-505d-a532-284d8a90fe71",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.10",
    "descricao": "EQUIPAMENTOS SDAI - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6199.8486,
    "ordem": 303
  },
  {
    "id": "02879a85-a3ea-5fd9-bfc9-ddcb72e68662",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.11",
    "descricao": "EQUIPAMENTOS SDAI - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 2066.6162,
    "ordem": 304
  },
  {
    "id": "e2b46b0d-81d3-5c9a-a42b-93f108810f11",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.12",
    "descricao": "EQUIPAMENTOS  SDAI - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4133.2324,
    "ordem": 305
  },
  {
    "id": "2dbab32b-561d-5655-a100-13b451fd4bba",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.13",
    "descricao": "EQUIPAMENTOS SDAI - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 8266.4648,
    "ordem": 306
  },
  {
    "id": "1d65d9f6-4d2e-5e2d-b530-8bb33ee37264",
    "tarefa_id": "1fa30abc-e855-50e4-801e-7ed0f3a2cd4a",
    "codigo": "16.2.14",
    "descricao": "EQUIPAMENTOS SDAI - PAV CASA DE MAQUINAS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4133.2324,
    "ordem": 307
  },
  {
    "id": "81a02953-88f6-5b65-bc14-f51fb1006119",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.1",
    "descricao": "TUBOS E CONEXÕES - GÁS - INFRA VERTICAL ( DIVIDIDO POR VÃOS ENTRE PAVIMENTOS )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 1160.8898,
    "ordem": 308
  },
  {
    "id": "57d797d6-58ed-570c-a1c3-2a391be495c1",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.2",
    "descricao": "TUBOS E CONEXÕES - GÁS - TERREO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 31967.024,
    "ordem": 309
  },
  {
    "id": "2331b7b1-0998-5a71-83b4-cdd316254223",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.3",
    "descricao": "TUBOS E CONEXÕES - GÁS - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6992.7865,
    "ordem": 310
  },
  {
    "id": "aa4a67f1-0c26-5309-98ae-d6a69bb854e1",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.4",
    "descricao": "TUBOS E CONEXÕES - GÁS - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 3995.878,
    "ordem": 311
  },
  {
    "id": "c658a9a0-de69-53fc-8544-0b66a78a4f91",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.5",
    "descricao": "TUBOS E CONEXÕES - GÁS - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 1497.939,
    "ordem": 312
  },
  {
    "id": "c6858079-912a-584f-b763-cc8d7d3016ad",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.6",
    "descricao": "TUBOS E CONEXÕES  - GÁS - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 6491.756,
    "ordem": 313
  },
  {
    "id": "7726411f-6923-5a79-8bef-fe73cf44ca33",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.7",
    "descricao": "TUBOS E CONEXÕES - GÁS - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 1997.939,
    "ordem": 314
  },
  {
    "id": "81a02953-88f6-5b65-bc14-f51fb1006119",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.1",
    "descricao": "EQUIPAMENTOS GÁS - LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2893.459,
    "ordem": 315
  },
  {
    "id": "57d797d6-58ed-570c-a1c3-2a391be495c1",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.2",
    "descricao": "EQUIPAMENTOS GÁS - PANORAMICO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2893.459,
    "ordem": 316
  },
  {
    "id": "2331b7b1-0998-5a71-83b4-cdd316254223",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.3",
    "descricao": "EQUIPAMENTOS GÁS - PAV TIPO ( 1° AO 36 )",
    "unidade": "VB",
    "quantidade_contratada": 36.0,
    "valor_unitario": 2266.8238,
    "ordem": 317
  },
  {
    "id": "aa4a67f1-0c26-5309-98ae-d6a69bb854e1",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.4",
    "descricao": "EQUIPAMENTOS  GÁS - PAV COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 4186.918,
    "ordem": 318
  },
  {
    "id": "c658a9a0-de69-53fc-8544-0b66a78a4f91",
    "tarefa_id": "93dea67e-befa-5059-b365-3c4febfa7dbc",
    "codigo": "17.1.5",
    "descricao": "EQUIPAMENTOS GÁS - PAV ROOFTOP + MEZANINO ROOFTOP",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 2893.459,
    "ordem": 319
  },
  {
    "id": "70bd30c5-ab1a-59f0-b7ab-7812bc9aa34d",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.1",
    "descricao": "ATERRAMENTO  - SPDA -  SUBSOLO 4",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 320
  },
  {
    "id": "cfcf234b-695e-54fb-aa78-f3f7db4ba5b8",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.2",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  LAZER",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 31041.0045,
    "ordem": 321
  },
  {
    "id": "639ced64-e121-5b66-9c25-6805ddece024",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.3",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  2° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 322
  },
  {
    "id": "8217b54f-1066-5e99-acc5-1a287c674793",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.4",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  6° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 323
  },
  {
    "id": "2fc60632-e1bb-56c5-9e3f-8307eaca6738",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.5",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  10° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 324
  },
  {
    "id": "a2014000-989e-5d0f-9e40-d9b2fc76ece3",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.6",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  14° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 325
  },
  {
    "id": "d57196ba-6a4b-54a5-8c38-4fe44043e03b",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.7",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  18° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 326
  },
  {
    "id": "9196c76b-2d94-5437-a5c8-f89ea7f86a5d",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.8",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  22° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 327
  },
  {
    "id": "250561f4-6146-5a77-80c4-f78bef2d6b03",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.9",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  26° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 328
  },
  {
    "id": "582a749c-316a-5f47-b394-daff32c64abf",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.10",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  30° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 329
  },
  {
    "id": "fc8de969-80e1-5612-b760-0f405066e8ef",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.11",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  34° PAV",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 330
  },
  {
    "id": "e5a76e7e-f742-5b68-9ea3-ffba00e15033",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.12",
    "descricao": "ANEL INTERMEDIARIO  - SPDA -  COBERTURA",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 19753.3665,
    "ordem": 331
  },
  {
    "id": "998c639f-237a-5c3b-9b67-a0f3c5871fe2",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.13",
    "descricao": "ANEL COBERTA - SPDA -  HELIPONTO",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 33862.914,
    "ordem": 332
  },
  {
    "id": "20cbf9b9-4a2e-5fb8-9e38-e56552e03b44",
    "tarefa_id": "141e3325-4189-5a52-8232-efac10938eed",
    "codigo": "18.1.14",
    "descricao": "SUBIDAS VERTICAIS ( DIVIDIDA POR VÃOS )",
    "unidade": "VB",
    "quantidade_contratada": 48.0,
    "valor_unitario": 1119.4565,
    "ordem": 333
  },
  {
    "id": "bc10005b-ccae-5a0b-9028-1fb1860a1f1f",
    "tarefa_id": "2f830ba5-d731-558a-bfe2-17d4dbccfacb",
    "codigo": "19.1.1",
    "descricao": "ADMINISTRAÇÃO OBRA ( MÊS )",
    "unidade": "VB",
    "quantidade_contratada": 17.0,
    "valor_unitario": 38000.0,
    "ordem": 334
  },
  {
    "id": "7691f277-5ae0-56cc-bd4d-c4607666a4f0",
    "tarefa_id": "2f830ba5-d731-558a-bfe2-17d4dbccfacb",
    "codigo": "19.1.2",
    "descricao": "FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS",
    "unidade": "VB",
    "quantidade_contratada": 1.0,
    "valor_unitario": 220000.0,
    "ordem": 335
  }
]

// ──────────────────────────────────────────
async function run() {
  console.log('\n🚀  FIP-WAVE Seed Runner iniciado...\n')

  // 1. Deletar detalhamentos existentes do contrato
  console.log('🗑   Limpando detalhamentos anteriores...')
  const { data: tarefasAtuais } = await sb.from('tarefas')
    .select('id')
    .in('grupo_macro_id', (await sb.from('grupos_macro').select('id').eq('contrato_id', CONTRATO_ID)).data?.map(g => g.id) ?? [])
  
  if (tarefasAtuais?.length) {
    const { error: e1 } = await sb.from('detalhamentos')
      .delete().in('tarefa_id', tarefasAtuais.map(t => t.id))
    if (e1) console.warn('  ⚠  detalhamentos:', e1.message)
  }

  // 2. Deletar tarefas existentes
  console.log('🗑   Limpando tarefas anteriores...')
  const { data: gruposAtuais } = await sb.from('grupos_macro').select('id').eq('contrato_id', CONTRATO_ID)
  if (gruposAtuais?.length) {
    const { error: e2 } = await sb.from('tarefas')
      .delete().in('grupo_macro_id', gruposAtuais.map(g => g.id))
    if (e2) console.warn('  ⚠  tarefas:', e2.message)
  }

  // 3. Deletar grupos_macro existentes
  console.log('🗑   Limpando grupos anteriores...')
  const { error: e3 } = await sb.from('grupos_macro').delete().eq('contrato_id', CONTRATO_ID)
  if (e3) console.warn('  ⚠  grupos_macro:', e3.message)

  // 4. Atualizar contrato com dados reais
  console.log('📝  Atualizando contrato WAVE...')
  const { error: ec } = await sb.from('contratos').update({
    numero: 'WAVE-2025-001',
    descricao: 'Contrato de Instalações - Empreendimento WAVE',
    tipo: 'percentual_servico_material',
    valor_total: 18000000.00,
    valor_servicos: 6700000.00,
    valor_material_direto: 11300000.00,
    data_inicio: '2026-04-01',
    data_fim: '2027-10-31',
    local_obra: 'São Paulo - SP',
    fiscal_obra: 'Eng. Responsável FIP'
  }).eq('id', CONTRATO_ID)
  if (ec) console.warn('  ⚠  contrato:', ec.message)

  // 5. Inserir 18 grupos macro
  console.log('📦  Inserindo 18 grupos macro...')
  const { error: eg } = await sb.from('grupos_macro').insert(GRUPOS)
  if (eg) { console.error('  ❌  grupos_macro:', eg.message); process.exit(1) }
  console.log('  ✅  18 grupos inseridos')

  // 6. Inserir 51 tarefas em lotes de 20
  console.log('📦  Inserindo 51 tarefas...')
  for (let i = 0; i < TAREFAS.length; i += 20) {
    const lote = TAREFAS.slice(i, i + 20)
    const { error: et } = await sb.from('tarefas').insert(lote)
    if (et) { console.error(`  ❌  tarefas lote ${i}-${i+20}:`, et.message); process.exit(1) }
  }
  console.log('  ✅  51 tarefas inseridas')

  // 7. Inserir 335 detalhamentos em lotes de 50
  console.log('📦  Inserindo 335 detalhamentos...')
  for (let i = 0; i < DETALHAMENTOS.length; i += 50) {
    const lote = DETALHAMENTOS.slice(i, i + 50)
    const { error: ed } = await sb.from('detalhamentos').insert(lote)
    if (ed) { console.error(`  ❌  detalhamentos lote ${i}-${i+50}:`, ed.message); process.exit(1) }
    process.stdout.write(`  ↳  ${Math.min(i+50, DETALHAMENTOS.length)}/335\r`)
  }
  console.log('  ✅  335 detalhamentos inseridos    ')

  console.log('\n✅  SEED CONCLUÍDO COM SUCESSO!')
  console.log(`   • 18 grupos macro`)
  console.log(`   • 51 tarefas`)
  console.log(`   • 335 detalhamentos`)
  console.log(`   • Contrato WAVE-2025-001 | R$ 18.000.000`)
  console.log(`   • Cronograma: Abril 2026 → Outubro 2027\n`)
}

run().catch(err => {
  console.error('\n❌  Erro fatal:', err)
  process.exit(1)
})
