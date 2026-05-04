// Grupos macro do contrato WAVE-2025-001 (1-19, com 11 ausente).
// Usado pra agrupar somatórios por categoria no email de liberação
// e em relatórios.

export const GRUPOS_MACRO: Record<number, string> = {
  1:  'ELÉTRICA SUBESTAÇÃO',
  2:  'GERAÇÃO',
  3:  'ALIMENTAÇÃO ELÉTRICA',
  4:  'DISTRIBUIÇÃO ELÉTRICA',
  5:  'LUMINÁRIAS',
  6:  'QUADROS ELÉTRICOS',
  7:  'LÓGICA (DADOS E VOZ) - INFRA SECA',
  8:  'ÁGUA PLUVIAL',
  9:  'ESGOTO',
  10: 'HIDRÁULICA',
  12: 'PISCINA E SPA',
  13: 'LOUÇAS E METAIS',
  14: 'COMBATE AO INCÊNDIO',
  15: 'EXTINTOR E SINALIZAÇÃO',
  16: 'SISTEMA DE DETECÇÃO E ALARME DE INCÊNDIO (SDAI)',
  17: 'GÁS',
  18: 'SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA',
  19: 'SERVIÇOS COMPLEMENTARES',
}

/**
 * Extrai o número do grupo macro a partir do código do item (ex.: "1.4.1" → 1,
 * "10.1.7" → 10). Retorna `null` quando o código não bate no padrão "N.M.K".
 */
export function getGrupoMacroNumero(codigo: string | null | undefined): number | null {
  if (!codigo) return null
  const m = String(codigo).match(/^(\d+)\./)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) && GRUPOS_MACRO[n] !== undefined ? n : null
}

export function getGrupoMacroNome(codigo: string | null | undefined): string | null {
  const n = getGrupoMacroNumero(codigo)
  return n != null ? GRUPOS_MACRO[n] : null
}

/**
 * Agrupa valores por grupo macro a partir de uma lista de itens com `codigo`
 * (item) e `valor`. Soma os valores por grupo, ignora itens sem grupo válido,
 * e retorna ordenado pelo número do grupo (1, 2, ..., 19).
 */
export function agruparPorMacro<T extends { codigo: string | null; valor: number }>(
  itens: T[],
): Array<{ grupo: number; nome: string; valor: number }> {
  const acc = new Map<number, number>()
  for (const it of itens) {
    const g = getGrupoMacroNumero(it.codigo)
    if (g == null) continue
    acc.set(g, (acc.get(g) ?? 0) + (Number(it.valor) || 0))
  }
  return Array.from(acc.entries())
    .sort(([a], [b]) => a - b)
    .map(([grupo, valor]) => ({ grupo, nome: GRUPOS_MACRO[grupo], valor }))
}
