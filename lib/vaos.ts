/**
 * Nomes de vãos por quantidade contratada (hardcoded per user spec).
 *
 * Itens cuja descrição contém "VAO" ou "VÃO" e cuja quantidade contratada
 * coincide com uma das entradas abaixo recebem nomenclatura individual por vão.
 * Os vãos são indexados a partir de 1 (igual a pavimentos_pct no banco).
 */

const T = (n: number) => `${n}T`
const TIPOS_37 = Array.from({ length: 37 }, (_, i) => T(i + 1))

const VAOS_48: string[] = [
  'SS4', 'SS3', 'SS2', 'SS1', 'Térreo', 'G1', 'G2', 'G3', 'Lazer', 'Pan.',
  ...TIPOS_37,
  'Cobertura',
]
const VAOS_50: string[] = [...VAOS_48, 'Rooftop', 'Heliponto']
const VAOS_37: string[] = TIPOS_37
const VAOS_46: string[] = [
  'SS2', 'SS1', 'Térreo', 'G1', 'G2', 'G3', 'Lazer', 'Pan.',
  ...TIPOS_37,
  'Cobertura',
]

export const VAOS_POR_QTD: Record<number, string[]> = {
  37: VAOS_37,
  46: VAOS_46,
  48: VAOS_48,
  50: VAOS_50,
}

const VAO_RE = /v[aã]o/i

/**
 * Retorna a lista de nomes de vãos se o item for do tipo "vão nomeado",
 * ou null se for item convencional / PAV TIPO.
 *
 * Usado em conjunto com detectarPavRange: chame detectarPavRange primeiro;
 * se retornar null, chame detectarVaos.
 */
export function detectarVaos(
  descricao: string | null | undefined,
  qtdeContratada: number,
): string[] | null {
  if (!descricao) return null
  if (!VAO_RE.test(descricao)) return null
  const qty = Math.round(qtdeContratada)
  const names = VAOS_POR_QTD[qty]
  if (!names || names.length !== qty) return null
  return names
}

/**
 * Retorna o nome do vão para um índice 1-based (chave de pavimentos_pct).
 * Fallback para "Vão N" se fora do range.
 */
export function nomeVao(names: string[], indexOneBased: number): string {
  return names[indexOneBased - 1] ?? `Vão ${indexOneBased}`
}
