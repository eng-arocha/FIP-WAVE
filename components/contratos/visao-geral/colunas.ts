// components/contratos/visao-geral/colunas.ts
// Ordem e rótulos das colunas da Visão Geral por modo. Cabeçalho, linhas e
// subtotal iteram a MESMA lista — assim nenhuma célula desalinha quando um
// modo ganha ou perde coluna.
import type { DashboardModo } from '@/types/dashboard'
import type { ColumnDef } from '@/lib/hooks/use-table-layout'

export type ColunaVisaoGeral = 'item' | 'contratado' | 'pctMedido' | 'realizado' | 'pctDescontado' | 'saldo' | 'pendente'

export type ColunaDef = ColumnDef<ColunaVisaoGeral> & { label: string; dica?: string }

const ITEM: ColunaDef = { key: 'item', label: 'Item', defaultWidth: 420, min: 160, max: 1200, type: 'string' }
const CONTRATADO: ColunaDef = { key: 'contratado', label: 'Contratado', defaultWidth: 140, min: 90, type: 'number' }
const REALIZADO: ColunaDef = { key: 'realizado', label: 'Realizado', defaultWidth: 140, min: 90, type: 'number' }
const SALDO: ColunaDef = {
  key: 'saldo', label: 'Saldo', defaultWidth: 140, min: 90, type: 'number',
  dica: 'Contratado − Realizado',
}

const COLUNAS: Record<DashboardModo, ColunaDef[]> = {
  total: [ITEM, CONTRATADO, REALIZADO, SALDO],
  servico: [
    ITEM, CONTRATADO, REALIZADO,
    {
      key: 'pctMedido', label: '% Medido', defaultWidth: 110, min: 80, type: 'number',
      dica: 'Serviço medido ÷ contratado. Inclui medição em aprovação (em azul).',
    },
    SALDO,
    {
      key: 'pendente', label: 'Med. s/ NF', defaultWidth: 130, min: 90, type: 'number',
      dica: 'Medição aprovada ainda sem NF de serviço',
    },
  ],
  material: [
    ITEM, CONTRATADO,
    {
      key: 'pctMedido', label: '% Mat. med.', defaultWidth: 110, min: 80, type: 'number',
      dica: 'Material medido ÷ material contratado. No item é o mesmo % do serviço; em tarefa e grupo pondera pelo material. Inclui medição em aprovação (em azul).',
    },
    {
      ...REALIZADO, defaultWidth: 200,
      dica: 'NF de material lançada (% do contratado). Laranja = NF atrás do material medido: a FIP precisa faturar. Verde-azulado = NF à frente do medido: se o físico andou, há serviço a medir.',
    },
    {
      key: 'pctDescontado', label: '% Mat. desc.', defaultWidth: 110, min: 80, type: 'number',
      dica: 'Material já descontado da Wave nas medições aprovadas (% do contratado). Roxo = parte do material medido ainda sem desconto: falta lastro no ERP.',
    },
    SALDO,
    {
      key: 'pendente', label: 'Aprov. s/ NF', defaultWidth: 130, min: 90, type: 'number',
      dica: 'Pedido aprovado ainda sem NF',
    },
  ],
}

export function colunasDoModo(modo: DashboardModo): ColunaDef[] {
  return COLUNAS[modo]
}

/** Cores dos marcadores — mesmas na tela e na legenda. */
export const COR_EM_APROVACAO = '#3B82F6'
export const COR_FIP_ATRASADA = '#F59E0B'
export const COR_SEM_LASTRO = '#8B5CF6'
export const COR_MAT_ADIANTADO = '#0D9488'
export const COR_ESTOURO = '#EF4444'
