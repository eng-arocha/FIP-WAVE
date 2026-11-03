import { describe, it, expect } from 'vitest'
import { parseNumeroBR, normalizarTexto, passaNoFiltro, filtroAtivo, descreverFiltro, type FiltroColuna } from './filtro-excel'

const num = (valor: number | null, texto = String(valor)) => ({ valor, texto })
const cond = (op: string, valor: string, valor2?: string): FiltroColuna =>
  ({ selecionados: null, condicao: { op: op as never, valor, valor2 } })

describe('parseNumeroBR', () => {
  it('lê pt-BR, ponto decimal, % e R$', () => {
    expect(parseNumeroBR('1.234,56')).toBe(1234.56)
    expect(parseNumeroBR('1234.56')).toBe(1234.56)
    expect(parseNumeroBR('1.234.567')).toBe(1234567)
    expect(parseNumeroBR('52,3%')).toBe(52.3)
    expect(parseNumeroBR('R$ -10')).toBe(-10)
    expect(parseNumeroBR('')).toBeNull()
    expect(parseNumeroBR('abc')).toBeNull()
  })
})

describe('passaNoFiltro — condições numéricas', () => {
  it('maior que / menor que / igual com tolerância de centavo', () => {
    expect(passaNoFiltro(cond('gt', '0'), 'numero', num(0.01))).toBe(true)
    expect(passaNoFiltro(cond('gt', '0'), 'numero', num(0))).toBe(false)
    expect(passaNoFiltro(cond('lt', '0'), 'numero', num(-5))).toBe(true)
    expect(passaNoFiltro(cond('eq', '44.719,57'), 'numero', num(44719.57))).toBe(true)
    expect(passaNoFiltro(cond('ne', '0'), 'numero', num(0))).toBe(false)
    expect(passaNoFiltro(cond('gte', '10'), 'numero', num(10))).toBe(true)
    expect(passaNoFiltro(cond('lte', '10'), 'numero', num(10.01))).toBe(false)
  })

  it('entre aceita os limites em qualquer ordem', () => {
    expect(passaNoFiltro(cond('between', '100', '10'), 'numero', num(50))).toBe(true)
    expect(passaNoFiltro(cond('between', '10', '100'), 'numero', num(100))).toBe(true)
    expect(passaNoFiltro(cond('between', '10', '100'), 'numero', num(101))).toBe(false)
  })

  it('condição sem valor não filtra; célula vazia só passa em "diferente de"', () => {
    expect(passaNoFiltro(cond('gt', ''), 'numero', num(-1))).toBe(true)
    expect(passaNoFiltro(cond('gt', '0'), 'numero', num(null, '(Vazias)'))).toBe(false)
    expect(passaNoFiltro(cond('ne', '0'), 'numero', num(null, '(Vazias)'))).toBe(true)
  })
})

describe('passaNoFiltro — texto e lista', () => {
  const cel = { valor: '3.2.11 CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV TIPO', texto: '3.2.11 CABEAMENTO ALIMENTAÇÃO ELÉTRICA - PAV TIPO' }
  it('contém ignora caixa e acento', () => {
    expect(passaNoFiltro(cond('contains', 'eletrica'), 'texto', cel)).toBe(true)
    expect(passaNoFiltro(cond('notContains', 'tipo'), 'texto', cel)).toBe(false)
    expect(passaNoFiltro(cond('startsWith', '3.2'), 'texto', cel)).toBe(true)
    expect(passaNoFiltro(cond('endsWith', 'cobertura'), 'texto', cel)).toBe(false)
    expect(normalizarTexto(' Ação ')).toBe('acao')
  })

  it('lista de valores marcados combina com a condição por E', () => {
    const f: FiltroColuna = { selecionados: ['10,00', '20,00'], condicao: { op: 'gt', valor: '15' } }
    expect(passaNoFiltro(f, 'numero', num(10, '10,00'))).toBe(false)
    expect(passaNoFiltro(f, 'numero', num(20, '20,00'))).toBe(true)
    expect(passaNoFiltro(f, 'numero', num(30, '30,00'))).toBe(false)
  })

  it('lista vazia esconde tudo; null mostra tudo', () => {
    expect(passaNoFiltro({ selecionados: [], condicao: null }, 'numero', num(1, '1,00'))).toBe(false)
    expect(filtroAtivo({ selecionados: null, condicao: null })).toBe(false)
    expect(filtroAtivo({ selecionados: null, condicao: { op: 'gt', valor: ' ' } })).toBe(false)
    expect(filtroAtivo(cond('gt', '0'))).toBe(true)
  })

  it('descreve o filtro ativo', () => {
    expect(descreverFiltro(cond('gt', '0'), 'numero')).toBe('É maior que 0')
    expect(descreverFiltro({ selecionados: ['1,00'], condicao: null }, 'numero')).toBe('= 1,00')
  })
})
