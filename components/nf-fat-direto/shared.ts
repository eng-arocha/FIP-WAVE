/**
 * Tipos, constantes e helpers puros compartilhados entre a página
 * /nf-fat-direto e seus componentes extraídos.
 */

// ── Tolerância de saldo ─────────────────────────────────────────────────────
export const TOLERANCE = 100 // R$ 100,00

export const STATUS_BADGE_RAW: Record<string, { label: string; color: string; bg: string }> = {
  aprovado:             { label: 'APROVADO',   color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  aguardando_aprovacao: { label: 'AGUARDANDO', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  encerrado:            { label: 'ENCERRADO',  color: '#6366F1', bg: 'rgba(99,102,241,0.12)' },
}

// ── Máscara CNPJ ────────────────────────────────────────────────────────────
export function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`
}

// ── Dias até a data ──────────────────────────────────────────────────────────
export function diasAte(dateStr: string): number {
  if (!dateStr) return Infinity
  const target = new Date(dateStr + 'T00:00:00')
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

export interface Solicitacao {
  id: string
  numero: number
  numero_pedido_fip?: number | null
  status: string
  data_solicitacao: string
  data_aprovacao?: string
  valor_total: number
  observacoes?: string | null
  fornecedor_razao_social?: string
  fornecedor_cnpj?: string
  contrato_id: string
  contrato: { id: string; numero: string; descricao: string }
  solicitante?: { nome: string }
  notas_fiscais: {
    id: string
    numero_nf: string
    valor: number
    status: string
    emitente?: string | null
    cnpj_emitente?: string | null
    data_emissao?: string | null
    data_recebimento?: string | null
    data_vencimento?: string | null
    arquivo_url?: string | null
    motivo_rejeicao?: string | null
    lancado_em?: string | null
    lancado_por?: { nome: string | null } | null
    divergencia_valor?: boolean
    divergencia_excedente?: number
    override_excede_saldo?: boolean
  }[]
  itens: { id: string }[]
}

// ── Cálculos de saldo (puros) ────────────────────────────────────────────────
export const getNfsValidas = (sol: Solicitacao) => sol.notas_fiscais.filter(n => n.status !== 'rejeitada')
export const getTotalNfs   = (sol: Solicitacao) => getNfsValidas(sol).reduce((a, n) => a + n.valor, 0)
export const getSaldo      = (sol: Solicitacao) => sol.valor_total - getTotalNfs(sol)

// Com saldo = saldo > TOLERANCE | Sem saldo = saldo ≤ TOLERANCE (inclui negativo dentro da tolerância)
export const temSaldo = (sol: Solicitacao) => getSaldo(sol) > TOLERANCE

/** Envolvido no contrato — usado nas listas de destinatários dos emails. */
export interface Envolvido {
  id: string
  nome: string
  email: string
  perfil: string
}
