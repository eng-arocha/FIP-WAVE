// Constantes puras — sem imports de server. Seguro para usar em client components.

export type Modulo = 'dashboard' | 'contratos' | 'medicoes' | 'aprovacoes' | 'empresas' | 'usuarios' | 'perfis' | 'documentos'
export type Acao = 'visualizar' | 'criar' | 'editar' | 'excluir' | 'aprovar'

export interface Permissao {
  modulo: string
  acao: string
}

export const MODULOS_CONFIG: Record<Modulo, Acao[]> = {
  dashboard:  ['visualizar'],
  contratos:  ['visualizar', 'criar', 'editar', 'excluir'],
  medicoes:   ['visualizar', 'criar', 'editar', 'aprovar'],
  aprovacoes: ['visualizar', 'aprovar'],
  empresas:   ['visualizar', 'criar', 'editar', 'excluir'],
  usuarios:   ['visualizar', 'criar', 'editar', 'excluir'],
  perfis:     ['visualizar', 'criar', 'editar', 'excluir'],
  documentos: ['visualizar', 'criar'],
}

export const MODULOS_LABELS: Record<Modulo, string> = {
  dashboard:  'Dashboard',
  contratos:  'Contratos',
  medicoes:   'Medições',
  aprovacoes: 'Aprovações',
  empresas:   'Empresas',
  usuarios:   'Usuários',
  perfis:     'Perfis de Acesso',
  documentos: 'Documentos',
}

export const ACOES_LABELS: Record<Acao, string> = {
  visualizar: 'Visualizar',
  criar:      'Criar',
  editar:     'Editar',
  excluir:    'Excluir',
  aprovar:    'Aprovar',
}

export const ALL_ACOES: Acao[] = ['visualizar', 'criar', 'editar', 'aprovar', 'excluir']

type PerfilTemplate = 'admin' | 'engenheiro_fip' | 'visualizador'

export const TEMPLATES: Record<PerfilTemplate, Permissao[]> = {
  admin: Object.entries(MODULOS_CONFIG).flatMap(([modulo, acoes]) =>
    acoes.map(acao => ({ modulo, acao }))
  ),
  engenheiro_fip: [
    ...['dashboard','contratos','medicoes','aprovacoes','empresas','usuarios','documentos'].map(modulo => ({ modulo, acao: 'visualizar' })),
    { modulo: 'contratos',  acao: 'criar' },
    { modulo: 'contratos',  acao: 'editar' },
    { modulo: 'medicoes',   acao: 'criar' },
    { modulo: 'medicoes',   acao: 'editar' },
    { modulo: 'medicoes',   acao: 'aprovar' },
    { modulo: 'aprovacoes', acao: 'aprovar' },
    { modulo: 'empresas',   acao: 'criar' },
    { modulo: 'empresas',   acao: 'editar' },
    { modulo: 'documentos', acao: 'criar' },
  ],
  visualizador: ['dashboard','contratos','medicoes','aprovacoes','empresas','usuarios','documentos'].map(modulo => ({ modulo, acao: 'visualizar' })),
}
