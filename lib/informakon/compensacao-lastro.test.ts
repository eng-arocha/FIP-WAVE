import { describe, it, expect } from 'vitest'
import { sugerirCompensacoes, distribuirNosItens, chaveDoCodigo } from './compensacao-lastro'

/** Recorte da MED-007 (26/10/2026): MSF lançada em QUADROS, falta em SUBESTAÇÃO. */
const BASE = {
  faltas: new Map([['1', 185387.82], ['2', 35268.99]]),
  notas: [
    { chave: '6', numeroNf: '584', valorADescontar: 52681.76 },
    { chave: '6', numeroNf: '550', valorADescontar: 39140.57 },
    { chave: '6', numeroNf: '559', valorADescontar: 72621.61 },
    { chave: '1', numeroNf: '15400', valorADescontar: 125829.91 },
    // Nota em QUADROS que não alocamos em SUBESTAÇÃO: não serve de origem.
    { chave: '6', numeroNf: '999', valorADescontar: 50000 },
  ],
  alocacao: [
    { numeroNf: '584', chave: '1', valor: 4813.85 },
    { numeroNf: '584', chave: '6', valor: 40000 },
    { numeroNf: '550', chave: '1', valor: 3576.51 },
    { numeroNf: '559', chave: '2', valor: 1824.97 },
    { numeroNf: '559', chave: '1', valor: 1824.97 },
    { numeroNf: '999', chave: '6', valor: 50000 },
  ],
  saldoPorChave: new Map([['6', 214443.94], ['1', 351603.47]]),
  demandaPorChave: new Map([['6', 8795.43]]),
}

describe('sugerirCompensacoes', () => {
  it('limita pelo lastro livre do macro item da nota', () => {
    const s = sugerirCompensacoes(BASE)
    // Livre em 6 = 214.443,94 − 8.795,43 = 205.648,51; só 164.443,94 é de
    // nota nossa de SUBESTAÇÃO. A falta maior (1) leva primeiro.
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ chaveFalta: '1', chaveNota: '6' })
    expect(s[0].valor).toBeCloseTo(164443.94, 2)
    expect(s[0].notas.sort()).toEqual(['550', '559', '584'])
  })

  it('não oferece duas vezes a mesma nota para faltas diferentes', () => {
    const s = sugerirCompensacoes({ ...BASE, faltas: new Map([['1', 100000], ['2', 35268.99]]) })
    const total = s.reduce((t, x) => t + x.valor, 0)
    expect(total).toBeCloseTo(135268.99, 2)
    expect(s.find(x => x.chaveFalta === '2')!.notas).toEqual(['559'])
  })

  it('desconta o que já foi compensado dos dois lados', () => {
    const s = sugerirCompensacoes({
      ...BASE,
      compensadoPorChaveFalta: new Map([['1', 180000]]),
      compensadoPorChaveNota: new Map([['6', 0]]),
    })
    expect(s.find(x => x.chaveFalta === '1')!.valor).toBeCloseTo(5387.82, 2)
  })

  it('lastro do macro item da nota já ocupado → nada a sugerir', () => {
    const s = sugerirCompensacoes({ ...BASE, demandaPorChave: new Map([['6', 214443.94]]) })
    expect(s).toHaveLength(0)
  })
})

describe('distribuirNosItens', () => {
  const itens = [
    { detalhamentoId: 'b', codigo: '6.1.10', saldo: 1000 },
    { detalhamentoId: 'a', codigo: '6.1.2', saldo: 300 },
    { detalhamentoId: 'c', codigo: '6.1.1', saldo: 200 },
  ]

  it('preenche os primeiros itens em ordem de código, até o saldo de cada um', () => {
    const r = distribuirNosItens(700, itens)
    expect(r.distribuicao).toEqual([
      { detalhamentoId: 'c', valor: 200 },
      { detalhamentoId: 'a', valor: 300 },
      { detalhamentoId: 'b', valor: 200 },
    ])
    expect(r.semEspaco).toBe(0)
  })

  it('devolve o que não coube', () => {
    const r = distribuirNosItens(2000, itens)
    expect(r.semEspaco).toBeCloseTo(500, 2)
  })

  it('pula item sem saldo', () => {
    const r = distribuirNosItens(100, [{ detalhamentoId: 'x', codigo: '6.1.1', saldo: -50 }, ...itens])
    expect(r.distribuicao[0].detalhamentoId).toBe('c')
  })
})

describe('chaveDoCodigo', () => {
  it('segue a chave da camada ②', () => {
    expect(chaveDoCodigo('6.1.5')).toBe('6')
    expect(chaveDoCodigo('19.1.2')).toBe('19.1.2')
  })
})
