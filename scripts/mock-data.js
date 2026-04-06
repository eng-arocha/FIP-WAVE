// Mock data for screenshot captures
// Mirrors the real contract structure: FIP × WAVE (R$18M)

const CONTRATO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const contrato = {
  id: CONTRATO_ID,
  numero: 'WAVE-2025-001',
  descricao: 'Instalações Elétricas, Hidráulicas e Sistemas Prediais',
  escopo: 'Fornecimento e instalação de todas as instalações prediais do Empreendimento WAVE Beira-Mar, Fortaleza-CE',
  tipo: 'global',
  status: 'ativo',
  valor_total: 18136704.03,
  valor_servicos: 6717736.74,
  valor_material_direto: 11418967.29,
  data_inicio: '2026-03-01',
  data_fim: '2027-10-31',
  local_obra: 'Fortaleza - CE',
  fiscal_obra: 'Carlos Arocha',
  email_fiscal: 'carlos.arocha@fip.com.br',
  valor_medido: 1847532.60,
  saldo: 16289171.43,
  percentual_medido: 10.19,
  qtd_medicoes_aprovadas: 2,
  qtd_medicoes_pendentes: 1,
  contratante: { nome: 'FIP Empreendimentos Ltda', cnpj: '12.345.678/0001-90' },
  contratado: { nome: 'WAVE Instalações Prediais Ltda', cnpj: '98.765.432/0001-10' },
}

const grupos = [
  { id: 'g01', codigo: '1',  nome: 'ELÉTRICA SUBESTAÇÃO',            tipo_medicao: 'misto', valor_contratado: 976005.27,  valor_material: 838822.32, valor_servico: 137182.95, valor_medido: 152340.80, percentual_medido: 15.6 },
  { id: 'g02', codigo: '2',  nome: 'GERAÇÃO',                        tipo_medicao: 'misto', valor_contratado: 1834456.23, valor_material: 1610013.92,valor_servico: 224442.31, valor_medido: 431053.37, percentual_medido: 23.5 },
  { id: 'g03', codigo: '3',  nome: 'ALIMENTAÇÃO ELÉTRICA',           tipo_medicao: 'misto', valor_contratado: 2535013.12, valor_material: 1497140.20,valor_servico: 1037872.92,valor_medido: 0,         percentual_medido: 0 },
  { id: 'g04', codigo: '4',  nome: 'DISTRIBUIÇÃO ELÉTRICA',          tipo_medicao: 'misto', valor_contratado: 987896.02,  valor_material: 317136.21, valor_servico: 670759.81, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g05', codigo: '5',  nome: 'LUMINÁRIAS',                     tipo_medicao: 'servico',valor_contratado: 287273.52,  valor_material: 0,          valor_servico: 287273.52, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g06', codigo: '6',  nome: 'QUADROS ELÉTRICOS',              tipo_medicao: 'misto', valor_contratado: 973939.07,  valor_material: 661523.63, valor_servico: 312415.44, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g07', codigo: '7',  nome: 'LÓGICA (DADOS E VOZ)',           tipo_medicao: 'misto', valor_contratado: 277801.37,  valor_material: 143093.30, valor_servico: 134708.07, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g08', codigo: '8',  nome: 'ÁGUA PLUVIAL',                   tipo_medicao: 'misto', valor_contratado: 1429014.84, valor_material: 640644.52, valor_servico: 788370.32, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g09', codigo: '9',  nome: 'ESGOTO',                         tipo_medicao: 'misto', valor_contratado: 1898133.76, valor_material: 850377.31, valor_servico: 1047756.45,valor_medido: 0,         percentual_medido: 0 },
  { id: 'g10', codigo: '10', nome: 'HIDRÁULICA',                     tipo_medicao: 'misto', valor_contratado: 2852340.51, valor_material: 1653704.59,valor_servico: 1198635.92,valor_medido: 0,         percentual_medido: 0 },
  { id: 'g12', codigo: '12', nome: 'PISCINA E SPA',                  tipo_medicao: 'misto', valor_contratado: 128774.75,  valor_material: 89578.25,  valor_servico: 39196.50,  valor_medido: 0,         percentual_medido: 0 },
  { id: 'g13', codigo: '13', nome: 'LOUÇAS E METAIS',                tipo_medicao: 'misto', valor_contratado: 126287.59,  valor_material: 71112.44,  valor_servico: 55175.15,  valor_medido: 0,         percentual_medido: 0 },
  { id: 'g14', codigo: '14', nome: 'COMBATE AO INCÊNDIO',            tipo_medicao: 'misto', valor_contratado: 1682329.71, valor_material: 1312168.18,valor_servico: 370161.53, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g15', codigo: '15', nome: 'EXTINTOR E SINALIZAÇÃO',         tipo_medicao: 'misto', valor_contratado: 150468.34,  valor_material: 119836.84, valor_servico: 30631.50,  valor_medido: 0,         percentual_medido: 0 },
  { id: 'g16', codigo: '16', nome: 'SISTEMA SDAI',                   tipo_medicao: 'misto', valor_contratado: 402774.19,  valor_material: 252519.89, valor_servico: 150254.30, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g17', codigo: '17', nome: 'GÁS',                            tipo_medicao: 'misto', valor_contratado: 255566.85,  valor_material: 184726.63, valor_servico: 70840.22,  valor_medido: 0,         percentual_medido: 0 },
  { id: 'g18', codigo: '18', nome: 'SPDA',                           tipo_medicao: 'misto', valor_contratado: 335924.86,  valor_material: 191601.77, valor_servico: 144323.09, valor_medido: 0,         percentual_medido: 0 },
  { id: 'g19', codigo: '19', nome: 'SERVIÇOS COMPLEMENTARES',        tipo_medicao: 'faturamento_direto', valor_contratado: 866000.00, valor_material: 866000.00, valor_servico: 0, valor_medido: 0, percentual_medido: 0 },
]

const medicoes = [
  { id: 'b1000000-0000-0000-0000-000000000001', numero: 1, periodo_referencia: '2026-03', tipo: 'servico', status: 'aprovado', valor_total: 79512.18, solicitante_nome: 'Carlos Arocha', data_submissao: '2026-04-02T09:00:00Z', data_aprovacao: '2026-04-05T14:30:00Z' },
  { id: 'b2000000-0000-0000-0000-000000000002', numero: 2, periodo_referencia: '2026-04', tipo: 'servico', status: 'aprovado', valor_total: 143287.44, solicitante_nome: 'Carlos Arocha', data_submissao: '2026-05-03T08:30:00Z', data_aprovacao: '2026-05-07T11:00:00Z' },
  { id: 'b3000000-0000-0000-0000-000000000003', numero: 3, periodo_referencia: '2026-05', tipo: 'servico', status: 'submetido', valor_total: 97642.90, solicitante_nome: 'Carlos Arocha', data_submissao: '2026-06-02T10:00:00Z', data_aprovacao: null },
]

const medicao1Detail = {
  ...medicoes[0],
  observacoes: 'Medição 01 — Março 2026. Avanço inicial na subestação.',
  itens: [
    { id: 'i1', detalhamento: { codigo: '1.1.1', descricao: 'ENTRADA DE ENERGIA - INFRAESTRUTURA', local: 'TORRE' }, quantidade_medida: 0.5, valor_unitario: 30747.78, valor_medido: 15373.89, percentual_medido: 50 },
    { id: 'i2', detalhamento: { codigo: '1.2.1', descricao: 'ENTRADA DE ENERGIA - CABEAMENTO MÉDIA', local: 'TORRE' }, quantidade_medida: 0.5, valor_unitario: 8895.41, valor_medido: 4447.71, percentual_medido: 50 },
    { id: 'i3', detalhamento: { codigo: '1.4.1', descricao: 'SE PMUC - INFRAESTRUTURA', local: 'TORRE' }, quantidade_medida: 0.25, valor_unitario: 26909.52, valor_medido: 6727.38, percentual_medido: 25 },
    { id: 'i4', detalhamento: { codigo: '1.5.1', descricao: 'SE PMUC - CABEAMENTO MÉDIA', local: 'TORRE' }, quantidade_medida: 0.25, valor_unitario: 20114.28, valor_medido: 5028.57, percentual_medido: 25 },
  ],
  anexos: [],
}

const solicitacoes = [
  {
    id: 's1000000-0000-0000-0000-000000000001', numero: 1, status: 'aprovado',
    data_solicitacao: '2026-03-15T09:00:00Z', data_aprovacao: '2026-03-20T14:00:00Z',
    valor_total: 348931.39, observacoes: 'Fornecimento de Painel de Média Tensão conforme especificação técnica.',
    fornecedor_razao_social: 'Schneider Electric Brasil Ltda', fornecedor_cnpj: '61.649.477/0001-06',
    solicitante: { nome: 'Carlos Arocha', email: 'carlos.arocha@fip.com.br' },
    aprovador: { nome: 'Diretor WAVE', email: 'diretoria@wave.com.br' },
    itens: [{ id: 'it1', descricao: 'Painel de Média Tensão SM6 conforme projeto elétrico', local: 'TORRE', qtde_solicitada: 1, valor_unitario: 348931.39, valor_total: 348931.39, tarefa: { codigo: '1.3', nome: 'ENTRADA DE ENERGIA - EQUIPAMENTOS' } }],
    notas_fiscais: [{ id: 'nf1', numero_nf: '004821', emitente: 'Schneider Electric Brasil Ltda', valor: 348931.39, data_emissao: '2026-04-15', status: 'validada', validado_em: '2026-04-20T09:00:00Z' }],
  },
  {
    id: 's2000000-0000-0000-0000-000000000002', numero: 2, status: 'aprovado',
    data_solicitacao: '2026-04-05T08:00:00Z', data_aprovacao: '2026-04-10T16:00:00Z',
    valor_total: 820562.47, observacoes: 'Grupo Gerador PMUC 500 KVA + QTA de reversão.',
    fornecedor_razao_social: 'Stemac Grupos Geradores Ltda', fornecedor_cnpj: '03.773.069/0001-00',
    solicitante: { nome: 'Carlos Arocha', email: 'carlos.arocha@fip.com.br' },
    aprovador: { nome: 'Diretor WAVE', email: 'diretoria@wave.com.br' },
    itens: [
      { id: 'it2', descricao: 'Grupo Gerador PMUC 500 KVA Perkins c/ escapamento', local: 'CASA DE MÁQUINAS', qtde_solicitada: 1, valor_unitario: 431053.37, valor_total: 431053.37, tarefa: { codigo: '2.1', nome: 'GRUPO GERADOR PMUC - EQUIPAMENTO' } },
      { id: 'it3', descricao: 'Quadros de Transferência Automática QTA + Reversão', local: 'CASA DE MÁQUINAS', qtde_solicitada: 1, valor_unitario: 389509.10, valor_total: 389509.10, tarefa: { codigo: '2.2', nome: 'GRUPO GERADOR PMUC - PAINEIS' } },
    ],
    notas_fiscais: [
      { id: 'nf2', numero_nf: '012345', emitente: 'Stemac Grupos Geradores Ltda', valor: 431053.37, data_emissao: '2026-05-10', status: 'validada', validado_em: '2026-05-15T14:00:00Z' },
      { id: 'nf3', numero_nf: '012398', emitente: 'Stemac Grupos Geradores Ltda', valor: 312000.00, data_emissao: '2026-05-25', status: 'pendente', validado_em: null },
    ],
  },
  {
    id: 's3000000-0000-0000-0000-000000000003', numero: 3, status: 'aguardando_aprovacao',
    data_solicitacao: '2026-05-20T11:00:00Z', data_aprovacao: null,
    valor_total: 159374.24, observacoes: 'Transformadores de força SE PMUC — 2 unidades.',
    fornecedor_razao_social: 'ABB Ltda', fornecedor_cnpj: '11.601.722/0001-00',
    solicitante: { nome: 'Carlos Arocha', email: 'carlos.arocha@fip.com.br' },
    aprovador: null,
    itens: [{ id: 'it4', descricao: 'Transformadores de força 2 x 500 KVA SE PMUC', local: 'TORRE', qtde_solicitada: 1, valor_unitario: 159374.24, valor_total: 159374.24, tarefa: { codigo: '1.6', nome: 'SE PMUC - EQUIPAMENTO' } }],
    notas_fiscais: [],
  },
]

const curvaS = Array.from({ length: 20 }, (_, i) => {
  const date = new Date('2026-03-01')
  date.setMonth(date.getMonth() + i)
  const mes = date.toISOString().slice(0, 7)
  const factor = i / 19
  const bell = Math.sin(factor * Math.PI) * 0.12
  return {
    mes,
    planejado_fisico: 250000 + bell * 2000000,
    planejado_fatd: 450000 + bell * 3500000,
    planejado_total: 700000 + bell * 5500000,
    realizado_fisico: i <= 2 ? 79512 + i * 31887 : 0,
    realizado_fatd: i <= 2 ? 348931 * (i > 0 ? 1 : 0) + 820562 * (i > 1 ? 1 : 0) : 0,
    realizado_total: i <= 2 ? (79512 + i * 31887) + (348931 * (i > 0 ? 1 : 0) + 820562 * (i > 1 ? 1 : 0)) : 0,
    planejado_fisico_acum: (250000 + bell * 2000000) * (i + 1) * 0.7,
    planejado_fatd_acum: (450000 + bell * 3500000) * (i + 1) * 0.65,
    planejado_total_acum: (700000 + bell * 5500000) * (i + 1) * 0.67,
    realizado_fisico_acum: i === 0 ? 79512 : i === 1 ? 222799 : i === 2 ? 320442 : 0,
    realizado_fatd_acum: i === 0 ? 0 : i === 1 ? 348931 : i === 2 ? 1169494 : 0,
    realizado_total_acum: i === 0 ? 79512 : i === 1 ? 571730 : i === 2 ? 1489936 : 0,
  }
})

const acompanhamento = {
  grupos: grupos.map(g => ({
    ...g,
    valor_medido_servico: g.valor_medido * 0.15,
    valor_aprovado_fatd: g.id === 'g01' ? 348931.39 : g.id === 'g02' ? 820562.47 : 0,
    valor_pendente_fatd: g.id === 'g01' ? 159374.24 : 0,
    valor_nf_fatd: g.id === 'g01' ? 348931.39 : g.id === 'g02' ? 743053.37 : 0,
    tarefas: [],
  })),
  total: {
    valor_servico: 6717736.74,
    valor_material: 11418967.29,
    valor_medido_servico: 320442.00,
    valor_aprovado_fatd: 1169493.86,
    valor_pendente_fatd: 159374.24,
    valor_nf_fatd: 1091984.76,
  },
}

const tarefas = [
  { id: 't1', codigo: '1.3', nome: 'ENTRADA DE ENERGIA - EQUIPAMENTOS', valor_material: 320380.45, valor_servico: 28550.94, grupo_macro: { codigo: '1', nome: 'ELÉTRICA SUBESTAÇÃO' } },
  { id: 't2', codigo: '1.6', nome: 'SE PMUC - EQUIPAMENTO', valor_material: 146668.20, valor_servico: 12706.04, grupo_macro: { codigo: '1', nome: 'ELÉTRICA SUBESTAÇÃO' } },
  { id: 't3', codigo: '2.1', nome: 'GRUPO GERADOR PMUC - EQUIPAMENTO', valor_material: 431063.70, valor_servico: 15445.47, grupo_macro: { codigo: '2', nome: 'GERAÇÃO' } },
  { id: 't4', codigo: '2.2', nome: 'GRUPO GERADOR PMUC - PAINEIS', valor_material: 352689.90, valor_servico: 37161.40, grupo_macro: { codigo: '2', nome: 'GERAÇÃO' } },
  { id: 't5', codigo: '2.5', nome: 'GRUPO GERADOR CONDOMÍNIO - EQUIPAMENTO', valor_material: 415311.09, valor_servico: 15742.28, grupo_macro: { codigo: '2', nome: 'GERAÇÃO' } },
  { id: 't6', codigo: '3.1', nome: 'ALIMENTAÇÃO ELÉTRICA - INFRAESTRUTURA', valor_material: 280000.00, valor_servico: 120000.00, grupo_macro: { codigo: '3', nome: 'ALIMENTAÇÃO ELÉTRICA' } },
  { id: 't7', codigo: '10.1', nome: 'HIDRÁULICA - ÁGUA FRIA', valor_material: 520000.00, valor_servico: 380000.00, grupo_macro: { codigo: '10', nome: 'HIDRÁULICA' } },
]

const estrutura = grupos.slice(0, 6).map(g => ({
  ...g,
  tarefas: tarefas.filter(t => t.grupo_macro.codigo === g.codigo).map(t => ({
    ...t,
    detalhamentos: [
      { id: `d-${t.id}-1`, codigo: `${t.codigo}.1`, descricao: t.nome, local: 'TORRE', unidade: 'SV', quantidade_contratada: 1, valor_unitario: t.valor_material + t.valor_servico, valor_material_unit: t.valor_material, valor_servico_unit: t.valor_servico },
    ],
  })),
}))

const dashboard = {
  stats: { total_contratos: 1, contratos_ativos: 1, medicoes_pendentes: 1, valor_total: 18136704.03 },
}

module.exports = {
  CONTRATO_ID, contrato, grupos, medicoes, medicao1Detail,
  solicitacoes, curvaS, acompanhamento, tarefas, estrutura, dashboard,
}
