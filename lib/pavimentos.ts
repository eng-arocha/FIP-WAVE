/**
 * Deteccao e calculo de medicao por pavimento.
 *
 * Itens cujo detalhamento tem descricao "PAV TIPO ( Xo AO Yo PAV )" sao
 * medidos individualmente por pavto (25/50/75/100 cada), em vez de um
 * input numerico binario (1 = pavto pronto, 0 = nao). Cf. migration 066.
 */

export type PavRange = {
  /** Numero do primeiro pavimento (ex: 1 ou 2). */
  primeiro: number
  /** Numero do ultimo pavimento (ex: 36). */
  ultimo: number
  /** Total de pavimentos no range (ultimo - primeiro + 1). */
  count: number
}

/** Pcts permitidos por pavto. */
export const PAV_PCTS = [0, 25, 50, 75, 100] as const
export type PavPct = (typeof PAV_PCTS)[number]

// Exemplos que devem casar (extraidos do contrato real):
//   "TUBOS E CONEXOES - HIDRAULICA - PAVIMENTO TIPO ( 1o AO 36o PAV )"
//   "TUBOS E CONEXOES - ESGOTO - PAVIMENTO TIPO ( 2o AO 36o PAV )"
//   variantes: "1° AO 36°", "1º AO 36º", "1 AO 36"
//
// Nao casam (mantem comportamento antigo):
//   "PRUMADA VERTICAL ( Dividida em vaos )"
//   "PAV TIPO ( 1° AO 36 )"  -- sem "PAV" no fim, intencionalmente ignorado
//                              porque o spec exige "PAV" explicito
const PAV_TIPO_RE = /PAV(?:IMENTO)?\s+TIPO/i
const PAV_RANGE_RE = /\(\s*(\d+)\s*[ºoO°]?\s+AO\s+(\d+)\s*[ºoO°]?\s+PAV\s*\)/i

/**
 * Decide se um detalhamento eh "pavimento tipo com range explicito".
 *
 * Retorna o range parseado, ou null para fallback ao input tradicional.
 *
 * Triplo gate (defensivo):
 *  1. Descricao contem "PAV TIPO" ou "PAVIMENTO TIPO"
 *  2. Descricao contem "( X AO Y PAV )" parseavel
 *  3. count(range) === round(qtdeContratada)  -- consistencia de dados
 */
export function detectarPavRange(descricao: string | null | undefined, qtdeContratada: number): PavRange | null {
  if (!descricao) return null
  if (!PAV_TIPO_RE.test(descricao)) return null
  const m = descricao.match(PAV_RANGE_RE)
  if (!m) return null
  const primeiro = parseInt(m[1], 10)
  const ultimo = parseInt(m[2], 10)
  if (!Number.isFinite(primeiro) || !Number.isFinite(ultimo)) return null
  if (ultimo < primeiro) return null
  const count = ultimo - primeiro + 1
  if (count !== Math.round(qtdeContratada)) return null
  return { primeiro, ultimo, count }
}

/** Lista de numeros de pavtos do range (inclusive). */
export function listarPavimentos({ primeiro, ultimo }: PavRange): number[] {
  const out: number[] = []
  for (let i = primeiro; i <= ultimo; i++) out.push(i)
  return out
}

/**
 * Soma os pcts para obter a quantidade absoluta acumulada (em unidades
 * do contrato, geralmente SV). Ex: 36 pavtos a 100% = 36 SV; pavto5=50%
 * + pavto6=25% = 0.75 SV.
 *
 * Ignora chaves nao-numericas defensivamente.
 */
export function somarPavimentos(pcts: Record<string, number> | null | undefined): number {
  if (!pcts) return 0
  let soma = 0
  for (const pct of Object.values(pcts)) {
    const n = Number(pct)
    if (Number.isFinite(n) && n > 0) soma += n / 100
  }
  return soma
}

/** Garante que um valor de pct eh um dos permitidos. */
export function normalizarPct(pct: number): PavPct {
  const n = Math.round(pct)
  if (n <= 0) return 0
  if (n <= 25) return 25
  if (n <= 50) return 50
  if (n <= 75) return 75
  return 100
}

/**
 * Mescla dois mapas pavimentos_pct, mantendo o MAIOR pct por pavto. Util
 * para construir o "acumulado anterior" varrendo medicoes aprovadas.
 */
export function mesclarMaximoPorPavto(
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...(a || {}) }
  if (b) {
    for (const [pavto, pct] of Object.entries(b)) {
      const n = Number(pct)
      if (!Number.isFinite(n)) continue
      const prev = Number(out[pavto] || 0)
      if (n > prev) out[pavto] = n
    }
  }
  return out
}
