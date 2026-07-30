/**
 * Subdivisão por MÊS de itens medidos em parcelas mensais.
 *
 * Segue o mesmo critério dos demais itens subdivididos do contrato — o
 * detalhamento tem quantidade contratada inteira > 1 e cada unidade é uma
 * parcela medida isoladamente, como os pavimentos (lib/pavimentos.ts) e os
 * vãos (lib/vaos.ts). Aqui a unidade é um mês de obra, então a grade é
 * binária (0/100 por mês), igual à de vãos: ou o mês foi executado, ou não.
 *
 * Caso real que originou o módulo: "19.1.1 ADMINISTRAÇÃO OBRA ( MÊS )",
 * 17 UN × R$ 38.000,00. Sem subdivisão, o item só podia ser medido de uma
 * vez (17 meses de uma tacada) ou por input numérico solto, sem registro
 * de QUAIS meses já entraram — que é justamente o controle que a grade dá.
 *
 * Os meses são indexados a partir de 1, na mesma chave `pavimentos_pct`
 * usada por pavimentos e vãos (migration 066).
 */

/** "( MÊS )", "(MES)", "( MESES )" — o parêntese é o que marca a subdivisão. */
const MES_RE = /\(\s*M[EÊ]S(?:ES)?\s*\)/i

/** Teto defensivo: acima disso a grade vira ruído visual. */
const MAX_MESES = 120

/**
 * Retorna a lista de rótulos de meses se o item for medido por parcela
 * mensal, ou null para o comportamento convencional.
 *
 * Triplo gate, no mesmo espírito de `detectarPavRange`:
 *  1. Descrição marca a subdivisão com "( MÊS )" / "( MESES )"
 *  2. Quantidade contratada é inteira (fracionária não vira grade binária)
 *  3. 2 <= quantidade <= MAX_MESES
 */
export function detectarMeses(
  descricao: string | null | undefined,
  qtdeContratada: number,
): string[] | null {
  if (!descricao) return null
  if (!MES_RE.test(descricao)) return null
  if (!Number.isFinite(qtdeContratada)) return null
  const qty = Math.round(qtdeContratada)
  // Quantidade fracionária (ex.: 17,5 meses) não tem grade binária coerente.
  if (Math.abs(qtdeContratada - qty) > 1e-6) return null
  if (qty < 2 || qty > MAX_MESES) return null
  return Array.from({ length: qty }, (_, i) => `${i + 1}º mês`)
}
