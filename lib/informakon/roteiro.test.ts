import { describe, it, expect } from 'vitest'
import {
  distribuirDescontoFifo, ordenarFifo, montarGrupo,
  type NotaLastro, type ItemRoteiro,
} from './roteiro'

const nota = (numero: string, data: string | null, saldo: number): NotaLastro => ({
  numero, documento: `NF-e ${numero}`, data, saldo,
})

describe('ordenarFifo', () => {
  it('mais antiga primeiro', () => {
    const r = ordenarFifo([nota('3', '2026-03-10', 1), nota('1', '2026-01-05', 1), nota('2', '2026-02-01', 1)])
    expect(r.map(n => n.numero)).toEqual(['1', '2', '3'])
  })

  it('nota sem data vai para o fim — sem data não dá para afirmar que é antiga', () => {
    const r = ordenarFifo([nota('X', null, 1), nota('A', '2026-05-01', 1)])
    expect(r.map(n => n.numero)).toEqual(['A', 'X'])
  })

  it('empate de data desempata pelo número — a ordem não pode variar por refresh', () => {
    const r = ordenarFifo([nota('20', '2026-01-01', 1), nota('3', '2026-01-01', 1)])
    expect(r.map(n => n.numero)).toEqual(['3', '20'])
  })
})

describe('distribuirDescontoFifo', () => {
  it('consome a mais antiga até o fim antes de tocar na seguinte', () => {
    const r = distribuirDescontoFifo(1_200, [
      nota('velha', '2026-01-01', 1_000),
      nota('nova', '2026-06-01', 5_000),
    ])
    expect(r.linhas.map(l => [l.numero, l.usar])).toEqual([['velha', 1_000], ['nova', 200]])
    expect(r.distribuido).toBe(1_200)
    expect(r.faltaLastro).toBe(0)
  })

  it('nunca passa do saldo de uma nota', () => {
    const r = distribuirDescontoFifo(900, [nota('A', '2026-01-01', 300), nota('B', '2026-02-01', 300)])
    expect(r.linhas.every(l => l.usar <= l.saldo)).toBe(true)
    expect(r.distribuido).toBe(600)
    expect(r.faltaLastro).toBe(300)
  })

  it('para de listar assim que o desconto fecha — não polui o roteiro', () => {
    const r = distribuirDescontoFifo(100, [
      nota('A', '2026-01-01', 5_000), nota('B', '2026-02-01', 5_000), nota('C', '2026-03-01', 5_000),
    ])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].usar).toBe(100)
    expect(r.saldoRemanescente).toBe(14_900)
  })

  it('desconto zero não gera linha nenhuma', () => {
    const r = distribuirDescontoFifo(0, [nota('A', '2026-01-01', 5_000)])
    expect(r.linhas).toHaveLength(0)
    expect(r.faltaLastro).toBe(0)
  })

  it('sem lastro nenhum, tudo vira falta — é o caso que trava o lançamento', () => {
    const r = distribuirDescontoFifo(250, [])
    expect(r.linhas).toHaveLength(0)
    expect(r.faltaLastro).toBe(250)
  })

  it('ignora nota zerada em vez de listá-la com 0,00', () => {
    const r = distribuirDescontoFifo(50, [nota('zerada', '2026-01-01', 0), nota('boa', '2026-02-01', 100)])
    expect(r.linhas.map(l => l.numero)).toEqual(['boa'])
  })

  it('centavos fecham exatamente com o total pedido', () => {
    const r = distribuirDescontoFifo(1_000.01, [
      nota('A', '2026-01-01', 333.34), nota('B', '2026-02-01', 333.33), nota('C', '2026-03-01', 333.34),
    ])
    expect(r.distribuido).toBe(1_000.01)
    expect(r.faltaLastro).toBe(0)
  })
})

describe('montarGrupo — o bloco que se digita', () => {
  const itens: ItemRoteiro[] = [
    {
      codigo: '3.1.5', codigoInformakon: '1382/38', descricao: 'INFRA - TÉRREO',
      pct: 5, liberacao: 500, pctFisicoAcumulado: 5, pctLancadoAcumulado: 5,
    },
  ]

  it('fecha quando liberação − desconto − FIP = serviço (exemplo do usuário)', () => {
    // Material 5.000 + serviço 5.000, 5% executado, nota de 3.000 lançada.
    const g = montarGrupo({
      chave: '1', rotulo: 'ELÉTRICA SUBESTAÇÃO', itens,
      desconto: 250, servico: 250, fipPrecisaEmitir: 0,
      lastro: [nota('3040', '2026-02-01', 3_000)],
    })
    expect(g.liberacao).toBe(500)
    expect(g.fecha).toBe(true)
    expect(g.distribuicao.linhas).toEqual([
      expect.objectContaining({ numero: '3040', usar: 250 }),
    ])
    expect(g.distribuicao.faltaLastro).toBe(0)
  })

  it('sem lastro: fecha na conta, mas a FIP precisa emitir antes', () => {
    const g = montarGrupo({
      chave: '1', rotulo: 'ELÉTRICA SUBESTAÇÃO', itens,
      desconto: 0, servico: 250, fipPrecisaEmitir: 250,
      lastro: [],
    })
    expect(g.fecha).toBe(true)               // 500 − 0 − 250 = 250
    expect(g.fipPrecisaEmitir).toBe(250)
    expect(g.distribuicao.linhas).toHaveLength(0)
  })

  it('lastro parcial: distribui o que dá e acusa a falta', () => {
    const g = montarGrupo({
      chave: '1', rotulo: 'ELÉTRICA SUBESTAÇÃO', itens,
      desconto: 250, servico: 250, fipPrecisaEmitir: 0,
      lastro: [nota('3040', '2026-02-01', 100)],
    })
    expect(g.distribuicao.distribuido).toBe(100)
    expect(g.distribuicao.faltaLastro).toBe(150)
  })

  it('acusa quando a conta NÃO fecha — não deixa lançar no escuro', () => {
    const g = montarGrupo({
      chave: '1', rotulo: 'X', itens,
      desconto: 100, servico: 250, fipPrecisaEmitir: 0,
      lastro: [nota('A', '2026-01-01', 1_000)],
    })
    expect(g.fecha).toBe(false)              // 500 − 100 − 0 ≠ 250
  })
})
