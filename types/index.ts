// ============================================================
// FIP-WAVE: Tipos TypeScript completos
// ============================================================

export type EmpresaTipo = 'contratante' | 'contratado' | 'ambos'
export type ContratoTipo = 'global' | 'preco_unitario' | 'percentual_servico_material'
export type ContratoStatus = 'rascunho' | 'ativo' | 'suspenso' | 'encerrado' | 'cancelado'
export type AditivoTipo = 'valor' | 'prazo' | 'escopo' | 'misto'
export type AditivoStatus = 'pendente' | 'aprovado' | 'rejeitado'
export type TipoMedicao = 'servico' | 'faturamento_direto' | 'misto'
export type MedicaoStatus = 'rascunho' | 'submetido' | 'em_analise' | 'aprovado' | 'rejeitado' | 'cancelado'
export type AcaoAprovacao = 'aprovado' | 'rejeitado' | 'solicitou_ajuste' | 'comentou'
export type TipoAnexo = 'nota_fiscal' | 'boleto' | 'relatorio_fotos' | 'medicao_assinada' | 'outro'
export type UsuarioPapel = 'admin' | 'aprovador' | 'solicitante' | 'visualizador'

export interface Empresa {
  id: string
  nome: string
  cnpj?: string
  tipo: EmpresaTipo
  email_contato?: string
  telefone?: string
  endereco?: string
  responsavel?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface Contrato {
  id: string
  numero: string
  descricao: string
  escopo?: string
  contratante_id: string
  contratado_id: string
  tipo: ContratoTipo
  valor_total: number
  valor_servicos: number
  valor_material_direto: number
  data_inicio: string
  data_fim: string
  status: ContratoStatus
  objeto?: string
  local_obra?: string
  fiscal_obra?: string
  email_fiscal?: string
  observacoes?: string
  created_at: string
  updated_at: string
  // Joins
  contratante?: Empresa
  contratado?: Empresa
}

export interface ContratoComResumo extends Contrato {
  valor_medido: number
  saldo: number
  percentual_medido: number
  qtd_medicoes_aprovadas: number
  qtd_medicoes_pendentes: number
}

export interface Aditivo {
  id: string
  contrato_id: string
  numero: number
  tipo: AditivoTipo
  descricao: string
  valor_anterior?: number
  valor_adicional?: number
  valor_novo?: number
  data_fim_anterior?: string
  data_fim_nova?: string
  status: AditivoStatus
  aprovado_por?: string
  aprovado_em?: string
  documento_url?: string
  created_at: string
}

export interface GrupoMacro {
  id: string
  contrato_id: string
  codigo: string
  nome: string
  tipo_medicao: TipoMedicao
  valor_contratado: number
  percentual_contrato?: number
  ordem: number
  created_at: string
  // Joins
  tarefas?: Tarefa[]
  valor_medido?: number
  saldo?: number
}

export interface Tarefa {
  id: string
  grupo_macro_id: string
  codigo: string
  nome: string
  unidade?: string
  quantidade_contratada?: number
  valor_unitario?: number
  valor_total: number
  percentual_grupo?: number
  ordem: number
  created_at: string
  // Joins
  detalhamentos?: Detalhamento[]
}

export interface Detalhamento {
  id: string
  tarefa_id: string
  codigo: string
  descricao: string
  unidade: string
  quantidade_contratada: number
  valor_unitario: number
  valor_total: number
  percentual_tarefa?: number
  ordem: number
  created_at: string
  // Acumulado de medições
  quantidade_medida_acumulada?: number
  valor_medido_acumulado?: number
  saldo_quantidade?: number
}

export interface Medicao {
  id: string
  contrato_id: string
  numero: number
  periodo_referencia: string
  tipo: TipoMedicao
  status: MedicaoStatus
  valor_total: number
  data_submissao?: string
  data_aprovacao?: string
  solicitante_nome: string
  solicitante_email: string
  observacoes?: string
  motivo_rejeicao?: string
  created_at: string
  updated_at: string
  // Joins
  contrato?: Contrato
  itens?: MedicaoItem[]
  anexos?: MedicaoAnexo[]
  notas_fiscais?: NotaFiscal[]
  aprovacoes?: Aprovacao[]
}

export interface MedicaoItem {
  id: string
  medicao_id: string
  detalhamento_id: string
  quantidade_medida: number
  valor_medido: number
  percentual_medido?: number
  observacao?: string
  created_at: string
  // Joins
  detalhamento?: Detalhamento
}

export interface MedicaoAnexo {
  id: string
  medicao_id: string
  nome_original: string
  nome_storage: string
  url: string
  tipo_documento: TipoAnexo
  tamanho_bytes?: number
  mime_type?: string
  uploaded_por?: string
  created_at: string
}

export interface NotaFiscal {
  id: string
  medicao_id: string
  numero_nf: string
  emitente: string
  cnpj_emitente?: string
  valor: number
  data_emissao: string
  descricao?: string
  url_arquivo?: string
  status_validacao: 'pendente' | 'aprovada' | 'rejeitada'
  validado_por?: string
  validado_em?: string
  observacao_validacao?: string
  created_at: string
}

export interface Aprovacao {
  id: string
  medicao_id: string
  aprovador_nome: string
  aprovador_email: string
  acao: AcaoAprovacao
  nivel: number
  comentario?: string
  created_at: string
}

export interface Usuario {
  id: string
  nome: string
  email: string
  empresa_id?: string
  papel: UsuarioPapel
  ativo: boolean
  ultimo_acesso?: string
  created_at: string
  empresa?: Empresa
}

// ============================================================
// LABELS E HELPERS DE UI
// ============================================================

export const CONTRATO_TIPO_LABELS: Record<ContratoTipo, string> = {
  global: 'Preço Global',
  preco_unitario: 'Preço Unitário',
  percentual_servico_material: '% Serviço / Faturamento Direto',
}

export const CONTRATO_STATUS_LABELS: Record<ContratoStatus, string> = {
  rascunho: 'Rascunho',
  ativo: 'Ativo',
  suspenso: 'Suspenso',
  encerrado: 'Encerrado',
  cancelado: 'Cancelado',
}

export const MEDICAO_STATUS_LABELS: Record<MedicaoStatus, string> = {
  rascunho: 'Rascunho',
  submetido: 'Aguardando Análise',
  em_analise: 'Em Análise',
  aprovado: 'Aprovado',
  rejeitado: 'Rejeitado',
  cancelado: 'Cancelado',
}

export const TIPO_MEDICAO_LABELS: Record<TipoMedicao, string> = {
  servico: 'Serviço',
  faturamento_direto: 'Faturamento Direto',
  misto: 'Misto',
}

export const ADITIVO_TIPO_LABELS: Record<AditivoTipo, string> = {
  valor: 'Acréscimo de Valor',
  prazo: 'Prorrogação de Prazo',
  escopo: 'Alteração de Escopo',
  misto: 'Valor + Prazo',
}
