import { describe, it, expect } from 'vitest'
import {
  detectarPavRange,
  listarPavimentos,
  somarPavimentos,
  normalizarPct,
  mesclarMaximoPorPavto,
} from './pavimentos'

describe('detectarPavRange', () => {
  it('detecta "PAVIMENTO TIPO ( 1o AO 36o PAV )"', () => {
    const r = detectarPavRange('TUBOS E CONEXOES - HIDRAULICA - PAVIMENTO TIPO ( 1o AO 36o PAV )', 36)
    expect(r).toEqual({ primeiro: 1, ultimo: 36, count: 36 })
  })

  it('detecta "PAVIMENTO TIPO ( 2o AO 36o PAV )" — primeiro pavto != 1', () => {
    const r = detectarPavRange('TUBOS E CONEXOES - ESGOTO - PAVIMENTO TIPO ( 2o AO 36o PAV )', 35)
    expect(r).toEqual({ primeiro: 2, ultimo: 36, count: 35 })
  })

  it('detecta variantes de ordinal (° e º)', () => {
    expect(detectarPavRange('PAV TIPO ( 1° AO 36° PAV )', 36)?.count).toBe(36)
    expect(detectarPavRange('PAV TIPO ( 1º AO 36º PAV )', 36)?.count).toBe(36)
  })

  it('aceita "PAV TIPO" (sem IMENTO)', () => {
    const r = detectarPavRange('INFRA ALIMENTACAO ELETRICA - PAV TIPO ( 1o AO 36o PAV )', 36)
    expect(r?.count).toBe(36)
  })

  it('NAO detecta "Dividida em vaos" (preserva comportamento antigo)', () => {
    expect(detectarPavRange('PRUMADA VERTICAL ( Dividida em vaos )', 48)).toBeNull()
    expect(detectarPavRange('PRUMADA VERTICAL ( Dividida em vaos entre pavimentos )', 48)).toBeNull()
  })

  it('NAO detecta range sem "PAV" no final', () => {
    // Spec: exige "PAV" explicito no fechamento do parenteses
    expect(detectarPavRange('PAV TIPO ( 1° AO 36 )', 36)).toBeNull()
  })

  it('NAO detecta se conta nao bate com quantidade_contratada (guarda de consistencia)', () => {
    // 36 pavtos no range, mas contratado 35 → null (dados inconsistentes)
    expect(detectarPavRange('PAV TIPO ( 1o AO 36o PAV )', 35)).toBeNull()
  })

  it('NAO detecta sem "PAV TIPO" no contexto', () => {
    expect(detectarPavRange('SUBSOLO ( 1o AO 36o PAV )', 36)).toBeNull()
  })

  it('retorna null para descricao vazia/null', () => {
    expect(detectarPavRange('', 36)).toBeNull()
    expect(detectarPavRange(null, 36)).toBeNull()
    expect(detectarPavRange(undefined, 36)).toBeNull()
  })
})

describe('listarPavimentos', () => {
  it('lista pavimentos inclusive', () => {
    expect(listarPavimentos({ primeiro: 2, ultimo: 5, count: 4 })).toEqual([2, 3, 4, 5])
  })
})

describe('somarPavimentos', () => {
  it('soma pcts dividindo por 100', () => {
    expect(somarPavimentos({ '1': 100, '2': 50, '3': 25 })).toBe(1.75)
  })

  it('retorna 0 para null/undefined/{}', () => {
    expect(somarPavimentos(null)).toBe(0)
    expect(somarPavimentos(undefined)).toBe(0)
    expect(somarPavimentos({})).toBe(0)
  })

  it('ignora valores nao-numericos', () => {
    expect(somarPavimentos({ '1': 100, '2': NaN as any, '3': 50 })).toBe(1.5)
  })
})

describe('normalizarPct', () => {
  it('mapeia valores intermediarios para o pct permitido mais proximo (para baixo)', () => {
    expect(normalizarPct(0)).toBe(0)
    expect(normalizarPct(10)).toBe(25)
    expect(normalizarPct(25)).toBe(25)
    expect(normalizarPct(40)).toBe(50)
    expect(normalizarPct(75)).toBe(75)
    expect(normalizarPct(99)).toBe(100)
    expect(normalizarPct(100)).toBe(100)
    expect(normalizarPct(150)).toBe(100)
    expect(normalizarPct(-10)).toBe(0)
  })
})

describe('mesclarMaximoPorPavto', () => {
  it('toma o maximo de cada pavto entre dois mapas', () => {
    const a = { '1': 100, '2': 25, '3': 50 }
    const b = { '2': 75, '3': 25, '4': 100 }
    expect(mesclarMaximoPorPavto(a, b)).toEqual({ '1': 100, '2': 75, '3': 50, '4': 100 })
  })

  it('aceita null/undefined em ambos os lados', () => {
    expect(mesclarMaximoPorPavto(null, { '1': 50 })).toEqual({ '1': 50 })
    expect(mesclarMaximoPorPavto({ '1': 50 }, null)).toEqual({ '1': 50 })
    expect(mesclarMaximoPorPavto(null, null)).toEqual({})
  })
})
