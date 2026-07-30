import { describe, it, expect } from 'vitest'
import { detectarMeses } from './meses'
import { detectarGradeBinaria } from './grade-binaria'

describe('detectarMeses', () => {
  it('casa o item real de administração de obra (19.1.1)', () => {
    const r = detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', 17)
    expect(r).toHaveLength(17)
    expect(r?.[0]).toBe('1º mês')
    expect(r?.[16]).toBe('17º mês')
  })

  it('aceita variações de acento e plural', () => {
    expect(detectarMeses('ADMINISTRACAO OBRA ( MES )', 12)).toHaveLength(12)
    expect(detectarMeses('APOIO ( MESES )', 5)).toHaveLength(5)
    expect(detectarMeses('ADMIN (MÊS)', 3)).toHaveLength(3)
  })

  it('não casa quando "mês" não está entre parênteses', () => {
    // O parêntese é o que marca a subdivisão; sem ele é texto solto.
    expect(detectarMeses('ADMINISTRAÇÃO MENSAL DA OBRA', 17)).toBeNull()
    expect(detectarMeses('LOCAÇÃO POR MÊS DE EQUIPAMENTO', 17)).toBeNull()
  })

  it('exige quantidade inteira ≥ 2', () => {
    expect(detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', 1)).toBeNull()
    expect(detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', 0)).toBeNull()
    expect(detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', 17.5)).toBeNull()
  })

  it('recusa quantidade acima do teto e valores inválidos', () => {
    expect(detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', 121)).toBeNull()
    expect(detectarMeses('ADMINISTRAÇÃO OBRA ( MÊS )', NaN)).toBeNull()
    expect(detectarMeses(null, 17)).toBeNull()
    expect(detectarMeses(undefined, 17)).toBeNull()
    expect(detectarMeses('', 17)).toBeNull()
  })

  it('não casa itens de vão nem de pavimento do contrato', () => {
    expect(detectarMeses('PRUMADA VERTICAL ( Dividida em vaos )', 48)).toBeNull()
    expect(detectarMeses('TUBOS E CONEXOES - HIDRAULICA - PAVIMENTO TIPO ( 1o AO 36o PAV )', 36)).toBeNull()
  })
})

describe('detectarGradeBinaria', () => {
  it('vão tem precedência e mantém a nomenclatura de vãos', () => {
    const g = detectarGradeBinaria('PRUMADA VERTICAL ( Dividida em vaos )', 48)
    expect(g?.termo).toBe('vão')
    expect(g?.termoPlural).toBe('vãos')
    expect(g?.nomes).toHaveLength(48)
  })

  it('mês devolve a nomenclatura de meses', () => {
    const g = detectarGradeBinaria('ADMINISTRAÇÃO OBRA ( MÊS )', 17)
    expect(g?.termo).toBe('mês')
    expect(g?.termoPlural).toBe('meses')
    expect(g?.nomes).toHaveLength(17)
  })

  it('item convencional não tem grade', () => {
    expect(detectarGradeBinaria('FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS', 1)).toBeNull()
    expect(detectarGradeBinaria('ENTRADA DE ENERGIA - INFRAESTRUTURA ( Poste ao PMT )', 1)).toBeNull()
  })
})
