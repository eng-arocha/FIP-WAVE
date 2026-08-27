import { describe, it, expect } from 'vitest'
import { ajustarGrupoPeloLastro, pctDoAjuste, type ItemAjuste } from './ajuste-por-lastro'

/**
 * Os números são os da Folha de Rosto da Medição 5, conferidos contra as
 * fórmulas nativas do arquivo. Se algum destes testes falhar, o boletim
 * deixou de reproduzir a planilha da engenheira.
 */

// Grupo 1 — ELÉTRICA SUBESTAÇÃO. Lastro no ERP: 72.780,81.
const G1: ItemAjuste[] = [
  { id: '1.8.1', totalMedido: 124_927.76, desconto: 119_977.36 },
  { id: '1.14.1', totalMedido: 5_123.93, desconto: 3_094.48 },
]
// Grupo 18 — SPDA. Lastro no ERP: 3.265,48.
const G18: ItemAjuste[] = [
  { id: '18.1.6', totalMedido: 18_765.70, desconto: 11_057.26 },
  { id: '18.1.14', totalMedido: 4_477.83, desconto: 2_110.59 },
]

describe('ajustarGrupoPeloLastro — grupo 1 da Medição 5', () => {
  const r = ajustarGrupoPeloLastro(G1, 72_780.81)
  const item = (id: string) => r.itens.find(i => i.id === id)!

  it('apura a falta contra o lastro do ERP', () => {
    expect(r.descontoIdeal).toBe(123_071.84)
    expect(r.falta).toBe(50_291.03)
  })

  it('o maior desconto absorve o corte inteiro', () => {
    expect(item('1.8.1').cortado).toBe(50_291.03)
    expect(item('1.14.1').cortado).toBe(0)
  })

  it('reproduz o VALOR AJUSTADO da planilha', () => {
    expect(item('1.8.1').totalAjustado).toBe(74_636.73)
    expect(item('1.14.1').totalAjustado).toBe(5_123.93)
  })

  it('o desconto do grupo fecha EXATAMENTE com o lastro', () => {
    const soma = r.itens.reduce((s, i) => s + i.descontoAjustado, 0)
    expect(Math.round(soma * 100) / 100).toBe(72_780.81)
  })

  it('reproduz a % AJUSTADA da planilha', () => {
    expect(pctDoAjuste(item('1.8.1').totalAjustado, 124_927.76)).toBeCloseTo(59.74391, 4)
  })
})

describe('ajustarGrupoPeloLastro — grupo 18 da Medição 5', () => {
  const r = ajustarGrupoPeloLastro(G18, 3_265.48)
  const item = (id: string) => r.itens.find(i => i.id === id)!

  it('reproduz o VALOR AJUSTADO da planilha', () => {
    expect(r.falta).toBe(9_902.37)
    expect(item('18.1.6').totalAjustado).toBe(8_863.33)
    expect(item('18.1.14').totalAjustado).toBe(4_477.83)
  })

  it('o desconto do grupo fecha EXATAMENTE com o lastro', () => {
    const soma = r.itens.reduce((s, i) => s + i.descontoAjustado, 0)
    expect(Math.round(soma * 100) / 100).toBe(3_265.48)
  })

  it('reproduz a % AJUSTADA da planilha', () => {
    expect(pctDoAjuste(item('18.1.6').totalAjustado, 19_753.37)).toBeCloseTo(44.86996, 4)
  })
})

describe('ajustarGrupoPeloLastro — as travas que a planilha não tem', () => {
  it('grupo com lastro de sobra não é tocado', () => {
    const r = ajustarGrupoPeloLastro(G1, 500_000)
    expect(r.falta).toBe(0)
    expect(r.itens.every(i => i.cortado === 0)).toBe(true)
    expect(r.itens.find(i => i.id === '1.8.1')!.totalAjustado).toBe(124_927.76)
  })

  it('grupo AUSENTE do retrato fica intocado — ausência não é lastro zero', () => {
    const r = ajustarGrupoPeloLastro(G1, null)
    expect(r.falta).toBe(0)
    expect(r.itens.every(i => i.cortado === 0)).toBe(true)
  })

  it('a falta escorre para o próximo maior quando não cabe no primeiro', () => {
    // A planilha jogava tudo num item só. Se o furo passasse do material dele,
    // a fórmula dela comeria a mão de obra sem avisar.
    const r = ajustarGrupoPeloLastro(G18, 0)
    expect(r.falta).toBe(13_167.85)
    expect(r.itens.find(i => i.id === '18.1.6')!.cortado).toBe(11_057.26)   // saturou
    expect(r.itens.find(i => i.id === '18.1.14')!.cortado).toBe(2_110.59)   // escorreu
    expect(r.cortado).toBe(13_167.85)
    expect(r.sobra).toBe(0)
  })

  it('NUNCA corta além do desconto do item — a mão de obra é intocável', () => {
    const r = ajustarGrupoPeloLastro(G18, 0)
    for (const i of r.itens) {
      expect(i.descontoAjustado).toBeGreaterThanOrEqual(0)
      // O que sobra no item é, no mínimo, o serviço executado.
      expect(i.totalAjustado).toBeGreaterThanOrEqual(i.totalMedido - i.desconto - 1e-9)
    }
  })

  it('falta maior que o grupo inteiro vira `sobra` explícita, não some num clamp', () => {
    const r = ajustarGrupoPeloLastro(
      [{ id: 'A', totalMedido: 1_000, desconto: 400 }],
      -600,   // dado inconsistente: lastro negativo
    )
    expect(r.falta).toBe(1_000)
    expect(r.cortado).toBe(400)
    expect(r.sobra).toBe(600)
    expect(r.itens[0].descontoAjustado).toBe(0)
  })

  it('a ordem do corte não depende da ordem da consulta', () => {
    const a = ajustarGrupoPeloLastro(G1, 72_780.81)
    const b = ajustarGrupoPeloLastro([...G1].reverse(), 72_780.81)
    for (const id of ['1.8.1', '1.14.1']) {
      expect(b.itens.find(i => i.id === id)!.totalAjustado)
        .toBe(a.itens.find(i => i.id === id)!.totalAjustado)
    }
  })

  it('item sem valor global não gera percentual infinito', () => {
    expect(pctDoAjuste(1_000, 0)).toBe(0)
  })
})
