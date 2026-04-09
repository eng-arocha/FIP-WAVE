import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { MedicaoStatus, ContratoStatus, AditivoStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Formata uma data para dd/mm/aaaa (pt-BR).
 * Retorna "—" para entradas inválidas/nulas em vez de "Invalid Date".
 * Aceita:
 *   - Date
 *   - ISO curta:    "2026-04-09"           → parseia como 00:00 local
 *   - ISO completa: "2026-04-09T14:30:00Z" → parseia direto (sem corromper)
 *   - null/undefined/"" → "—"
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (date == null || date === '') return '—'
  let d: Date
  if (typeof date === 'string') {
    // Se não contém 'T', é uma data pura — adiciona hora zero LOCAL
    // para evitar off-by-one de timezone. Se já contém 'T', parseia direto.
    d = date.includes('T') ? new Date(date) : new Date(date + 'T00:00:00')
  } else {
    d = date
  }
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

/**
 * Formata data e hora (pt-BR). Mesmo tratamento robusto do formatDate.
 */
export function formatDatetime(date: string | Date | null | undefined): string {
  if (date == null || date === '') return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}

export function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '')
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function parsePeriodo(periodo: string): string {
  const [year, month] = periodo.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[parseInt(month) - 1]}/${year}`
}

export function getMedicaoStatusColor(status: MedicaoStatus): string {
  const map: Record<MedicaoStatus, string> = {
    rascunho: 'bg-gray-100 text-gray-700 border-gray-200',
    submetido: 'bg-blue-100 text-blue-700 border-blue-200',
    em_analise: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    aprovado: 'bg-green-100 text-green-700 border-green-200',
    rejeitado: 'bg-red-100 text-red-700 border-red-200',
    cancelado: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  return map[status]
}

export function getContratoStatusColor(status: ContratoStatus): string {
  const map: Record<ContratoStatus, string> = {
    rascunho: 'bg-gray-100 text-gray-700 border-gray-200',
    ativo: 'bg-green-100 text-green-700 border-green-200',
    suspenso: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    encerrado: 'bg-blue-100 text-blue-700 border-blue-200',
    cancelado: 'bg-red-100 text-red-700 border-red-200',
  }
  return map[status]
}

export function getAditivoStatusColor(status: AditivoStatus): string {
  const map: Record<AditivoStatus, string> = {
    pendente: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    aprovado: 'bg-green-100 text-green-700 border-green-200',
    rejeitado: 'bg-red-100 text-red-700 border-red-200',
  }
  return map[status]
}

export function calcularProgresso(medido: number, contratado: number): number {
  if (contratado === 0) return 0
  return Math.min((medido / contratado) * 100, 100)
}

export function gerarNumeroPeriodo(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
