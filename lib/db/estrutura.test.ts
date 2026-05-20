import { describe, it, expect } from 'vitest'

// Recriacao local do comparador (privado em estrutura.ts) para teste de
// regressao do bug onde "10.3" aparecia antes de "10.1" e "10.1.12" antes
// de "10.1.1" porque o sort era alfabetico.
function compareCodigo(a: string | null | undefined, b: string | null | undefined): number {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  const partsA = sa.split('.')
  const partsB = sb.split('.')
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const a_i = partsA[i] ?? ''
    const b_i = partsB[i] ?? ''
    const na = Number(a_i)
    const nb = Number(b_i)
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na - nb
    } else {
      const cmp = a_i.localeCompare(b_i)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

describe('compareCodigo (sort natural de codigo hierarquico)', () => {
  it('ordena 10.1 antes de 10.3', () => {
    const arr = ['10.3', '10.1', '10.2'].sort(compareCodigo)
    expect(arr).toEqual(['10.1', '10.2', '10.3'])
  })

  it('ordena 10.1.1 antes de 10.1.12 (nao alfabetico)', () => {
    const arr = ['10.1.12', '10.1.1', '10.1.2', '10.1.10'].sort(compareCodigo)
    expect(arr).toEqual(['10.1.1', '10.1.2', '10.1.10', '10.1.12'])
  })

  it('grupos 9 antes de 10 (single-digit vs double-digit)', () => {
    const arr = ['10.1', '9.1', '10.2', '9.2'].sort(compareCodigo)
    expect(arr).toEqual(['9.1', '9.2', '10.1', '10.2'])
  })

  it('codigo mais curto vem antes do mais especifico', () => {
    const arr = ['10.1.1', '10.1', '10.1.2'].sort(compareCodigo)
    expect(arr).toEqual(['10.1', '10.1.1', '10.1.2'])
  })

  it('aceita null/undefined sem crashar', () => {
    expect(compareCodigo(null, '10.1')).toBeLessThan(0)
    expect(compareCodigo('10.1', undefined)).toBeGreaterThan(0)
    expect(compareCodigo(null, null)).toBe(0)
  })
})
