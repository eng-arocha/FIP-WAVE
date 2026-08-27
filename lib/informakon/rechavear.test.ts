import { describe, it, expect } from 'vitest'
import { rechavearRetrato, type AlocacaoNossa, type NotaRetrato } from './rechavear'

const erp = (chave: string, numeroNf: string, a: number, d = 0): NotaRetrato => ({
  chave, numeroNf, documento: `NF-e ${numeroNf}`, valorADescontar: a, valorDescontado: d,
})
const nosso = (numeroNf: string, chave: string, valor: number): AlocacaoNossa => ({ numeroNf, chave, valor })

describe('rechavearRetrato', () => {
  it('leva a nota para o macro item em que NÓS a alocamos', () => {
    const r = rechavearRetrato([erp('10', '300', 3_000)], [nosso('300', '14', 3_000)])
    expect(r.porChave.get('14')?.aDescontar).toBe(3_000)
    expect(r.porChave.has('10')).toBe(false)
    expect(r.totalRealocado).toBe(3_000)
    expect(r.realocadas[0]).toMatchObject({ numero: '300', deChave: '10', paraChaves: ['14'] })
  })

  it('não muda o total do retrato — só o endereço', () => {
    const notas = [erp('10', '300', 3_000), erp('9', '301', 1_500, 500), erp('4', '302', 900)]
    const aloc = [nosso('300', '14', 1), nosso('302', '14', 1)]
    const r = rechavearRetrato(notas, aloc)
    const total = [...r.porChave.values()].reduce((s, v) => s + v.aDescontar + v.descontado, 0)
    expect(Math.round(total * 100) / 100).toBe(3_000 + 2_000 + 900)
  })

  it('rateia entre os nossos macro itens na proporção da nossa alocação', () => {
    const r = rechavearRetrato(
      [erp('10', '300', 1_000, 200)],
      [nosso('300', '14', 75), nosso('300', '16', 25)],
    )
    expect(r.porChave.get('14')?.aDescontar).toBe(750)
    expect(r.porChave.get('16')?.aDescontar).toBe(250)
    expect(r.porChave.get('14')?.descontado).toBe(150)
    expect(r.porChave.get('16')?.descontado).toBe(50)
  })

  it('nota que o ERP já colocou onde também alocamos fica parada', () => {
    const r = rechavearRetrato(
      [erp('14', '206', 500)],
      [nosso('206', '14', 300), nosso('206', '10', 700)],
    )
    expect(r.porChave.get('14')?.aDescontar).toBe(500)
    expect(r.porChave.has('10')).toBe(false)
    expect(r.totalRealocado).toBe(0)
  })

  it('a nota quebrada pelo ERP: o pedaço que já bate fica, o resto vem', () => {
    // NF-e 206 aparece em 7 macro itens no retrato real. Os pedaços que caem
    // onde também alocamos ficam parados; os que caem onde não alocamos vêm
    // para os nossos, rateados. O total da nota não muda.
    const notas = ['1', '2', '3', '4'].map(c => erp(c, '206', 100))
    const aloc = [nosso('206', '1', 50), nosso('206', '4', 50)]
    const r = rechavearRetrato(notas, aloc)
    expect(r.porChave.get('1')?.aDescontar).toBe(200)   // 100 seu + 50 de '2' + 50 de '3'
    expect(r.porChave.get('4')?.aDescontar).toBe(200)
    expect(r.porChave.has('2')).toBe(false)
    expect(r.porChave.has('3')).toBe(false)
    const total = [...r.porChave.values()].reduce((s, v) => s + v.aDescontar, 0)
    expect(total).toBe(400)
    expect(r.totalRealocado).toBe(200)
  })

  it('nota que não conhecemos fica onde o ERP colocou', () => {
    const r = rechavearRetrato([erp('10', '999', 800)], [nosso('300', '14', 1)])
    expect(r.porChave.get('10')?.aDescontar).toBe(800)
    expect(r.totalRealocado).toBe(0)
  })

  it('nota SEM NÚMERO não vira lastro — o roteiro também a descarta', () => {
    // Contá-la aqui faria a camada ② liberar percentual apoiado num saldo que
    // o roteiro de lançamento não encontra: os dois lados leriam o mesmo
    // retrato e discordariam do saldo do grupo.
    const r = rechavearRetrato(
      [{ chave: '10', numeroNf: null, valorADescontar: 400, valorDescontado: 0 }],
      [nosso('300', '14', 1)],
    )
    expect(r.porChave.has('10')).toBe(false)
    expect(r.totalRealocado).toBe(0)
  })

  it('casa 534 com 0000534 e com "NF-e 534"', () => {
    const r = rechavearRetrato([erp('10', '0000534', 100)], [nosso('NF-e 534', '14', 1)])
    expect(r.porChave.get('14')?.aDescontar).toBe(100)
  })

  it('o grupo 19 usa o detalhamento como chave', () => {
    const r = rechavearRetrato([erp('8', '213366', 58.23)], [nosso('213366', '19.1.2', 58.23)])
    expect(r.porChave.get('19.1.2')?.aDescontar).toBe(58.23)
  })

  it('alocação com valor zero não sequestra a nota', () => {
    const r = rechavearRetrato([erp('10', '300', 500)], [nosso('300', '14', 0)])
    expect(r.porChave.get('10')?.aDescontar).toBe(500)
  })
})
