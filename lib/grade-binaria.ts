/**
 * Resolução da grade de medição BINÁRIA (0% ou 100% por célula).
 *
 * Dois tipos de item do contrato são medidos assim: vãos nomeados
 * (lib/vaos.ts) e parcelas mensais (lib/meses.ts). Ambos usam a mesma grade
 * na tela de Nova Medição e a mesma coluna `pavimentos_pct` (migration 066),
 * indexada a partir de 1 — o que muda entre eles é só a nomenclatura.
 *
 * Pavimentos (lib/pavimentos.ts) NÃO entram aqui: aceitam 25/50/75/100 por
 * célula, então têm grade própria. Chame `detectarPavRange` primeiro; só se
 * ele devolver null vale consultar esta função.
 */

import { detectarVaos } from './vaos'
import { detectarMeses } from './meses'

export interface GradeBinaria {
  /** Rótulos das células, na ordem — índice 0 = chave "1" em pavimentos_pct. */
  nomes: string[]
  /** Singular, pro botão: "Medir por vão" / "Medir por mês". */
  termo: string
  /** Plural, pra instrução: "Selecione os vãos concluídos". */
  termoPlural: string
}

/**
 * Decide se o detalhamento é medido por grade binária e com que nomenclatura.
 * Retorna null para itens convencionais (botões de % ou input numérico).
 */
export function detectarGradeBinaria(
  descricao: string | null | undefined,
  qtdeContratada: number,
): GradeBinaria | null {
  const vaos = detectarVaos(descricao, qtdeContratada)
  if (vaos) return { nomes: vaos, termo: 'vão', termoPlural: 'vãos' }

  const meses = detectarMeses(descricao, qtdeContratada)
  if (meses) return { nomes: meses, termo: 'mês', termoPlural: 'meses' }

  return null
}
