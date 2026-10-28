import { describe, it, expect } from 'vitest'
import {
  apurarViolacoes,
  limitarAoSaldo,
  mensagemLimiteExcedido,
  somarPorDetalhamento,
  textoCortesSaldo,
  type SaldoDetalhamento,
} from './limite-pedido'

// Casos reais de out/2026 (docs/DIVIDAS.md).
const saldos = new Map<string, SaldoDetalhamento>([
  // 1.3.1: Novemp #1059 (220.000) + #1085 (100.380,45) = contratado inteiro.
  ['d131', { codigo: '1.3.1', descricao: 'Painel MT', limite: 320380.45, aprovado: 320380.45, emAprovacao: 0 }],
  // 1.13.1: nada comprado.
  ['d1131', { codigo: '1.13.1', descricao: 'Quadros', limite: 32751.20, aprovado: 0, emAprovacao: 0 }],
  // 17.2.1: contratado 2.256,18.
  ['d1721', { codigo: '17.2.1', descricao: 'Equip. gás lazer', limite: 2256.18, aprovado: 0, emAprovacao: 0 }],
  ['dsem', { codigo: '19.1.1', descricao: 'Sem base', limite: 0, aprovado: 0, emAprovacao: 0 }],
])

describe('apurarViolacoes', () => {
  it('trava item já 100% comprometido', () => {
    const v = apurarViolacoes(saldos, { d131: 153471.24 }, 'material')
    expect(v).toHaveLength(1)
    expect(v[0].codigo).toBe('1.3.1')
    expect(v[0].saldoDisponivel).toBe(0)
  })

  it('trava pedido único maior que o contratado (17.2.1)', () => {
    const v = apurarViolacoes(saldos, { d1721: 5932.09 }, 'material')
    expect(v[0].saldoDisponivel).toBeCloseTo(2256.18, 2)
  })

  it('deixa passar o que cabe, com folga de 1 centavo', () => {
    expect(apurarViolacoes(saldos, { d1131: 32751.21 }, 'material')).toHaveLength(0)
    expect(apurarViolacoes(saldos, { d1131: 32751.30 }, 'material')).toHaveLength(1)
  })

  it('item sem base contratual não trava (como antes)', () => {
    expect(apurarViolacoes(saldos, { dsem: 999999 }, 'material')).toHaveLength(0)
  })

  it('mensagem cita item, pedido e saldo livre', () => {
    const msg = mensagemLimiteExcedido(apurarViolacoes(saldos, { d1721: 5932.09 }, 'material'))
    expect(msg).toContain('17.2.1')
    expect(msg).toContain('5.932,09')
    expect(msg).toContain('2.256,18')
  })
})

describe('somarPorDetalhamento', () => {
  it('soma itens repetidos e ignora item sem detalhamento', () => {
    expect(somarPorDetalhamento([
      { detalhamento_id: 'a', valor_total: 10 },
      { detalhamento_id: 'a', valor_total: 5 },
      { detalhamento_id: null, valor_total: 99 },
    ])).toEqual({ a: 15 })
  })
})

describe('limitarAoSaldo — pedido FIP automático da medição', () => {
  it('corta o que passa do saldo e grava o resto', () => {
    const { itens, cortes } = limitarAoSaldo([
      { detalhamento_id: 'd131', valor_total: 153471.24, descricao: '1.3.1' },
      { detalhamento_id: 'd1131', valor_total: 30000, descricao: '1.13.1' },
    ], saldos)
    expect(itens).toEqual([{ detalhamento_id: 'd1131', valor_total: 30000, descricao: '1.13.1' }])
    expect(cortes).toEqual([
      { codigo: '1.3.1', descricao: 'Painel MT', pedido: 153471.24, gravado: 0, cortado: 153471.24 },
    ])
  })

  it('dois itens no mesmo detalhamento dividem o mesmo saldo', () => {
    const { itens, cortes } = limitarAoSaldo([
      { detalhamento_id: 'd1721', valor_total: 2000 },
      { detalhamento_id: 'd1721', valor_total: 1000 },
    ], saldos)
    expect(itens.map(i => i.valor_total)).toEqual([2000, 256.18])
    expect(cortes[0].cortado).toBeCloseTo(743.82, 2)
  })

  it('detalhamento sem base não é cortado', () => {
    const { itens, cortes } = limitarAoSaldo([{ detalhamento_id: 'dsem', valor_total: 500 }], saldos)
    expect(itens).toHaveLength(1)
    expect(cortes).toHaveLength(0)
  })

  it('texto do alerta soma os cortes', () => {
    expect(textoCortesSaldo([])).toBeNull()
    expect(textoCortesSaldo([
      { codigo: '1.3.1', cortado: 100, gravado: 0 },
      { codigo: '1.5.1', cortado: 50.5, gravado: 10 },
    ])).toContain('R$ 150,50')
  })
})
