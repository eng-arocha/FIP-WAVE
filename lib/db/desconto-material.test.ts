import { describe, it, expect } from 'vitest'
import { classificarCoberturaDoSite, type ItemCoberturaSite } from './desconto-material'

const fip = (itens: ItemCoberturaSite[]) => {
  const r = classificarCoberturaDoSite(itens)
  return (id: string) => r.get(id)!.fipPrecisaEmitir
}

/**
 * Camada ③ item a item (decisão do usuário, 29/10/2026). Números reais do
 * contrato depois da MED-007 — os mesmos do relatório Material sem NF.
 */
describe('camada ③ item a item — regressão da MED-007', () => {
  it('1.3.1 não estoura: pedido = contratado, a FIP não emite nada', () => {
    // Na regra do balde o 1.3.1 recebeu R$ 153 mil da FIP acima do contratado.
    const f = fip([
      { detalhamentoId: '1.3.1', matMedido: 320_380.45, nfTerceiro: 303_748.01, pedidoAprovado: 320_380.45 },
      // Vizinhos do grupo 1 sem nota não puxam FIP para o 1.3.1.
      { detalhamentoId: '1.2.1', matMedido: 6_130.55, nfTerceiro: 0, pedidoAprovado: 6_453.21 },
      { detalhamentoId: '1.10.1', matMedido: 7_838.02, nfTerceiro: 0, pedidoAprovado: 7_838.02 },
    ])
    expect(f('1.3.1')).toBe(0)
    expect(f('1.2.1')).toBe(0)
    expect(f('1.10.1')).toBe(0)
  })

  it('2.2.1: a FIP emite a diferença exata e o item fecha no contratado', () => {
    // Pedido 323.737,54 já inclui os 107.076,35 da FIP (com nota).
    const contratado = 352_689.90
    const pedido = 323_737.54
    const r = classificarCoberturaDoSite([
      { detalhamentoId: '2.2.1', matMedido: 352_689.90, nfTerceiro: 287_838.08, pedidoAprovado: pedido },
    ]).get('2.2.1')!
    expect(r.fipPrecisaEmitir).toBeCloseTo(28_952.36, 2)
    expect(pedido + r.fipPrecisaEmitir).toBeLessThanOrEqual(contratado + 0.005)
  })

  it('material já descontado continua sendo cobrado da FIP', () => {
    // O 2.2.1 está 100% descontado da Wave — com nota de outro item. A regra
    // do balde (pendente de desconto) dava zero aqui.
    const f = fip([{ detalhamentoId: '2.2.1', matMedido: 352_689.90, nfTerceiro: 287_838.08, pedidoAprovado: 323_737.54 }])
    expect(f('2.2.1')).toBeGreaterThan(0)
  })

  it('pedido da FIP autorizado e sem nota não volta como emissão nova', () => {
    // MED-007, 2.2.1: o portão 1 criou o pedido 20 com R$ 35.268,99 para os
    // painéis. Autorizar de novo emitiria a nota em dobro.
    const r = classificarCoberturaDoSite([{
      detalhamentoId: 'P', matMedido: 251_930.18, nfTerceiro: 216_661.19, pedidoAprovado: 216_661.19 + 35_268.99,
    }]).get('P')!
    expect(r.fipPrecisaEmitir).toBe(0)
    expect(r.notaACaminho).toBeCloseTo(35_268.99, 2)
  })

  it('sem o pedido, a FIP continua sendo chamada', () => {
    const f = fip([{ detalhamentoId: 'P', matMedido: 251_930.18, nfTerceiro: 216_661.19, pedidoAprovado: 216_661.19 }])
    expect(f('P')).toBeCloseTo(35_268.99, 2)
  })

  it('NF sobrando no vizinho do macro item não abate', () => {
    // Grupo 2: 2.9.1 tem R$ 310,00 de NF além do medido.
    const f = fip([
      { detalhamentoId: '2.2.1', matMedido: 352_689.90, nfTerceiro: 287_838.08, pedidoAprovado: 323_737.54 },
      { detalhamentoId: '2.9.1', matMedido: 5_889.97, nfTerceiro: 6_199.97, pedidoAprovado: 6_199.97 },
    ])
    expect(f('2.2.1')).toBeCloseTo(28_952.36, 2)
    expect(f('2.9.1')).toBe(0)
  })

  it('item sem NF nem pedido: a FIP emite o medido inteiro (18.1.8)', () => {
    expect(fip([{ detalhamentoId: 'X', matMedido: 11_057.26, nfTerceiro: 0, pedidoAprovado: 0 }])('X')).toBe(11_057.26)
  })
})

describe('camada ③ — cobertura do item', () => {
  it('pedido aprovado sem nota é nota a caminho, até o medido', () => {
    const r = classificarCoberturaDoSite([
      { detalhamentoId: 'A', matMedido: 100, nfTerceiro: 20, pedidoAprovado: 60 },
    ]).get('A')!
    expect(r.notaACaminho).toBe(40)
    expect(r.fipPrecisaEmitir).toBe(40)
  })

  it('compensação de lastro registrada no item conta como cobertura', () => {
    const itens = [{ detalhamentoId: 'Q', matMedido: 100, nfTerceiro: 0, pedidoAprovado: 0 }]
    expect(fip(itens)('Q')).toBe(100)
    expect(fip([{ ...itens[0], coberturaExtra: 70 }])('Q')).toBe(30)
  })

  it('cobertura maior que o medido não vira FIP negativa nem nota a caminho', () => {
    const r = classificarCoberturaDoSite([
      { detalhamentoId: 'A', matMedido: 50, nfTerceiro: 300, pedidoAprovado: 300 },
    ]).get('A')!
    expect(r.fipPrecisaEmitir).toBe(0)
    expect(r.notaACaminho).toBe(0)
  })

  it('pedido + FIP nunca passa do medido', () => {
    for (const [medido, nf, pedido] of [[100, 0, 30], [100, 50, 30], [100, 120, 90], [0, 0, 40]]) {
      const r = classificarCoberturaDoSite([
        { detalhamentoId: 'A', matMedido: medido, nfTerceiro: nf, pedidoAprovado: pedido },
      ]).get('A')!
      expect(Math.max(nf, pedido) + r.fipPrecisaEmitir).toBeLessThanOrEqual(Math.max(medido, nf, pedido))
    }
  })
})
