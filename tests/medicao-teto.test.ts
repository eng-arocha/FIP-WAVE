import { describe, it, expect } from 'vitest'
import {
  calcularTetoMedicao,
  excedeTeto,
  mensagemExcedeTeto,
} from '@/lib/medicao-teto'

describe('calcularTetoMedicao', () => {
  it('item nunca medido: teto = quantidade contratada', () => {
    expect(calcularTetoMedicao(1, 0)).toBe(1)
    expect(calcularTetoMedicao(36, 0)).toBe(36)
  })

  it('desconta o acumulado aprovado anterior — quantidade_medida é o DELTA', () => {
    // 16.1.3 INFRA SDAI - SUBSOLO 02: 1 un contratada, 0,75 já aprovada.
    expect(calcularTetoMedicao(1, 0.75)).toBe(0.25)
    expect(calcularTetoMedicao(36, 14.25)).toBe(21.75)
  })

  it('item já 100% medido tem teto zero, nunca negativo', () => {
    expect(calcularTetoMedicao(1, 1)).toBe(0)
    expect(calcularTetoMedicao(1, 1.5)).toBe(0)
  })

  it('sem quantidade contratada válida não se afirma teto', () => {
    expect(calcularTetoMedicao(0, 0)).toBeNull()
    expect(calcularTetoMedicao(null, 0)).toBeNull()
    expect(calcularTetoMedicao(undefined, 0)).toBeNull()
    expect(calcularTetoMedicao(-1, 0)).toBeNull()
  })

  it('arredonda em 6 casas, como o NUMERIC(15,6) da coluna', () => {
    expect(calcularTetoMedicao(1, 0.1)).toBe(0.9)
    expect(calcularTetoMedicao(3, 0.83 + 0.91 + 0.07)).toBe(1.19)
  })
})

describe('excedeTeto', () => {
  it('barra acima do teto', () => {
    expect(excedeTeto(1.5, 0.25)).toBe(true)
    expect(excedeTeto(2, 1)).toBe(true)
  })

  it('aceita no teto e abaixo', () => {
    expect(excedeTeto(0.25, 0.25)).toBe(false)
    expect(excedeTeto(0.1, 0.25)).toBe(false)
    expect(excedeTeto(0, 0)).toBe(false)
  })

  it('tolera resíduo de ponto flutuante de 1 ulp da coluna', () => {
    expect(excedeTeto(0.25 + 1e-9, 0.25)).toBe(false)
    expect(excedeTeto(0.25 + 1e-4, 0.25)).toBe(true)
  })

  it('teto null não bloqueia nada (item sem quantidade contratada)', () => {
    expect(excedeTeto(999, null)).toBe(false)
  })

  it('valor não-numérico não bloqueia (outra validação pega)', () => {
    expect(excedeTeto(NaN, 1)).toBe(false)
  })
})

describe('mensagemExcedeTeto', () => {
  it('mostra teto, acumulado anterior e o % que o pedido atingiria', () => {
    const msg = mensagemExcedeTeto({
      codigo: '16.1.3',
      unidade: 'SV',
      quantidadeContratada: 1,
      qtdAnterior: 0.75,
      qtdNova: 1.5,
      teto: 0.25,
    })
    expect(msg).toContain('16.1.3')
    expect(msg).toContain('0,25 SV')      // teto
    expect(msg).toContain('0,75 SV')      // já aprovado
    expect(msg).toContain('225%')         // (0,75 + 1,5) / 1
  })

  it('omite a parte de "já aprovado" quando não há histórico', () => {
    const msg = mensagemExcedeTeto({
      codigo: '16.1.3',
      quantidadeContratada: 1,
      qtdAnterior: 0,
      qtdNova: 2,
      teto: 1,
    })
    expect(msg).not.toContain('medições anteriores')
    expect(msg).toContain('200%')
  })
})
