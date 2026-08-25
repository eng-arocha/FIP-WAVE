import { describe, it, expect } from 'vitest'
import {
  detectarBreakdown,
  normalizarBreakdown,
  calcularDeltaBreakdown,
  clampPctCelula,
  arredondarQtde,
} from '@/lib/medicao-breakdown'

// Item real do contrato WAVE-2025-001 citado no chamado.
const DESC_16_1_11 = 'INFRA SDAI - PAV TIPO ( 1° AO 36° PAV )'
const QTD_16_1_11 = 36

describe('detectarBreakdown', () => {
  it('reconhece PAV TIPO com range explícito', () => {
    const modo = detectarBreakdown(DESC_16_1_11, QTD_16_1_11)
    expect(modo?.tipo).toBe('pavimento')
    expect(modo?.binaria).toBe(false)
    expect(modo?.celulas).toHaveLength(36)
    expect(modo?.celulas[0]).toEqual({ num: 1, chave: '1', label: '1º pav' })
    expect(modo?.pctsPermitidos).toEqual([0, 25, 50, 75, 100])
  })

  it('reconhece grade binária de vãos e usa a nomenclatura dos vãos', () => {
    const modo = detectarBreakdown('PRUMADA VERTICAL ( dividida em vãos )', 37)
    expect(modo?.tipo).toBe('grade')
    expect(modo?.binaria).toBe(true)
    // Atalhos de botão iguais aos do PAV TIPO: o ajuste do admin não é binário.
    expect(modo?.pctsPermitidos).toEqual([0, 25, 50, 75, 100])
    expect(modo?.celulas[0].label).toBe('1T')
  })

  it('devolve null pra item convencional', () => {
    expect(detectarBreakdown('QUADRO DE DISTRIBUIÇÃO - TÉRREO', 1)).toBeNull()
    // PAV TIPO sem "PAV" no fecho do range não casa (regra de lib/pavimentos)
    expect(detectarBreakdown('INFRA SDAI - PAV TIPO ( 1° AO 36 )', 36)).toBeNull()
  })

  it('rejeita range que não bate com a quantidade contratada', () => {
    expect(detectarBreakdown(DESC_16_1_11, 30)).toBeNull()
  })
})

describe('clampPctCelula', () => {
  const pav = detectarBreakdown(DESC_16_1_11, QTD_16_1_11)!
  const grade = detectarBreakdown('PRUMADA VERTICAL ( vãos )', 37)!

  it('permite descer até o piso do acumulado aprovado', () => {
    expect(clampPctCelula(pav, 50, 0)).toBe(50)
    expect(clampPctCelula(pav, 50, 25)).toBe(50)
  })

  it('trava abaixo do piso', () => {
    expect(clampPctCelula(pav, 50, 75)).toBe(75)
    expect(clampPctCelula(pav, 0, 100)).toBe(100)
  })

  it('limita a 0..100 e arredonda', () => {
    expect(clampPctCelula(pav, 140, 0)).toBe(100)
    expect(clampPctCelula(pav, -5, 0)).toBe(0)
    expect(clampPctCelula(pav, 33.4, 0)).toBe(33)
  })

  it('aceita qualquer % fora dos atalhos', () => {
    expect(clampPctCelula(pav, 83, 0)).toBe(83)
    expect(clampPctCelula(pav, 91, 0)).toBe(91)
    expect(clampPctCelula(pav, 7, 0)).toBe(7)
  })

  it('grade binária também aceita % livre no ajuste do admin', () => {
    expect(clampPctCelula(grade, 83, 0)).toBe(83)
    expect(clampPctCelula(grade, 50, 0)).toBe(50)
    expect(clampPctCelula(grade, 0, 0)).toBe(0)
    expect(clampPctCelula(grade, 100, 0)).toBe(100)
  })

  it('o piso continua valendo com % livre', () => {
    expect(clampPctCelula(grade, 83, 90)).toBe(90)
    expect(clampPctCelula(pav, 83, 90)).toBe(90)
  })
})

describe('normalizarBreakdown — caso do chamado (90% → 50%)', () => {
  const modo = detectarBreakdown(DESC_16_1_11, QTD_16_1_11)!

  it('baixa um pavimento medido nesta medição e recalcula o acumulado', () => {
    const atual = { '1': 100, '2': 100, '12': 90 }
    const r = normalizarBreakdown({ modo, pedido: { '12': 50 }, atual, anterior: {} })

    expect(r.mapa['12']).toBe(50)
    // Células não citadas no pedido são preservadas.
    expect(r.mapa['1']).toBe(100)
    expect(r.mapa['2']).toBe(100)
    expect(r.somaAcumulada).toBe(2.5)
    expect(r.alteradas).toEqual([
      { chave: '12', label: '12º pav', de: 90, para: 50, anterior: 0 },
    ])
    expect(r.elevadasAoPiso).toHaveLength(0)
  })

  it('não deixa desmedir trabalho já aprovado — eleva até o piso', () => {
    const r = normalizarBreakdown({
      modo,
      pedido: { '12': 50 },
      atual: { '12': 90 },
      anterior: { '12': 75 },
    })
    expect(r.mapa['12']).toBe(75)
    expect(r.elevadasAoPiso).toEqual([
      { chave: '12', label: '12º pav', de: 50, para: 75, anterior: 75 },
    ])
  })

  it('trata células ausentes no gravado como o piso aprovado', () => {
    const r = normalizarBreakdown({ modo, pedido: {}, atual: null, anterior: { '3': 100 } })
    expect(r.mapa).toEqual({ '3': 100 })
    expect(r.alteradas).toHaveLength(0)
    expect(r.somaAcumulada).toBe(1)
  })

  it('reporta chaves fora do range em vez de gravá-las', () => {
    const r = normalizarBreakdown({ modo, pedido: { '99': 100 }, atual: null, anterior: {} })
    expect(r.chavesIgnoradas).toEqual(['99'])
    expect(r.mapa['99']).toBeUndefined()
  })

  it('zera a célula quando o pedido é 0 e não há piso', () => {
    const r = normalizarBreakdown({ modo, pedido: { '5': 0 }, atual: { '5': 100 }, anterior: {} })
    expect(r.mapa['5']).toBeUndefined()
    expect(r.somaAcumulada).toBe(0)
    expect(r.alteradas).toEqual([{ chave: '5', label: '5º pav', de: 100, para: 0, anterior: 0 }])
  })
})

describe('normalizarBreakdown — % livre', () => {
  const pav = detectarBreakdown(DESC_16_1_11, QTD_16_1_11)!
  const grade = detectarBreakdown('PRUMADA VERTICAL ( vãos )', 37)!

  it('grava 83% num pavimento e soma a fração certa', () => {
    const r = normalizarBreakdown({ modo: pav, pedido: { '7': 83 }, atual: null, anterior: {} })
    expect(r.mapa['7']).toBe(83)
    expect(r.somaAcumulada).toBe(0.83)
    expect(r.alteradas).toEqual([{ chave: '7', label: '7º pav', de: 0, para: 83, anterior: 0 }])
  })

  it('grava 91% num vão (item de lançamento binário)', () => {
    const r = normalizarBreakdown({ modo: grade, pedido: { '1': 91 }, atual: { '1': 100 }, anterior: {} })
    expect(r.mapa['1']).toBe(91)
    expect(r.somaAcumulada).toBe(0.91)
  })

  it('eleva ao piso mesmo com % livre', () => {
    const r = normalizarBreakdown({ modo: grade, pedido: { '1': 83 }, atual: { '1': 100 }, anterior: { '1': 100 } })
    expect(r.mapa['1']).toBe(100)
    expect(r.elevadasAoPiso).toEqual([
      { chave: '1', label: '1T', de: 83, para: 100, anterior: 100 },
    ])
  })

  it('soma vários % livres sem erro de ponto flutuante', () => {
    const r = normalizarBreakdown({
      modo: pav,
      pedido: { '1': 83, '2': 91, '3': 7 },
      atual: null,
      anterior: {},
    })
    expect(r.somaAcumulada).toBe(1.81)
    expect(calcularDeltaBreakdown(r.somaAcumulada, 0)).toBe(1.81)
  })
})

describe('calcularDeltaBreakdown', () => {
  it('delta = acumulado do breakdown − acumulado aprovado anterior', () => {
    expect(calcularDeltaBreakdown(2.5, 1)).toBe(1.5)
    expect(calcularDeltaBreakdown(1, 1)).toBe(0)
  })

  it('fica negativo quando o breakdown some abaixo do histórico (sinaliza backfill)', () => {
    expect(calcularDeltaBreakdown(0.5, 2)).toBe(-1.5)
  })

  it('não acumula erro de ponto flutuante', () => {
    // 36 pavimentos a 25% = 9 exatos.
    const modo = detectarBreakdown(DESC_16_1_11, QTD_16_1_11)!
    const pedido: Record<string, number> = {}
    for (const c of modo.celulas) pedido[c.chave] = 25
    const r = normalizarBreakdown({ modo, pedido, atual: null, anterior: {} })
    expect(r.somaAcumulada).toBe(9)
    expect(calcularDeltaBreakdown(r.somaAcumulada, 0)).toBe(9)
  })
})

describe('arredondarQtde', () => {
  it('corta na 6ª casa, como NUMERIC(15,6)', () => {
    expect(arredondarQtde(0.1234567)).toBe(0.123457)
    expect(arredondarQtde(9.000000000000002)).toBe(9)
  })
})
