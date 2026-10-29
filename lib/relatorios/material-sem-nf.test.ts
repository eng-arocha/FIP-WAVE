import { describe, it, expect } from 'vitest'
import { linhaMaterialSemNf, montarRelatorioMaterialSemNf, type ItemMaterialEntrada } from './material-sem-nf'

const item = (over: Partial<ItemMaterialEntrada> & { codigo: string }): ItemMaterialEntrada => ({
  id: over.codigo, nome: over.codigo, materialContratado: 1, materialMedido: 0,
  materialDescontado: 0, fornecedores: [], ...over,
})

// Números reais de 29/10/2026.
const i221 = item({
  codigo: '2.2.1', materialContratado: 352_689.90, materialMedido: 352_689.90, materialDescontado: 352_689.90,
  fornecedores: [
    { fornecedor: 'MSF', pedido: 216_661.19, nf: 180_761.73 },
    { fornecedor: 'FIP', pedido: 107_076.35, nf: 107_076.35 },
  ],
})
const i231 = item({
  codigo: '2.3.1', materialContratado: 25_823.49, materialMedido: 24_532.32,
  fornecedores: [{ fornecedor: 'FIP', pedido: 19_367.62, nf: 19_367.63 }],
})
const i211 = item({
  codigo: '2.1.1', materialContratado: 431_063.70,
  fornecedores: [{ fornecedor: 'Gerador', pedido: 314_000, nf: 0 }],
})

describe('material medido sem NF', () => {
  it('2.2.1: pedido aprovado conta como comprado; falta o que não tem pedido', () => {
    const l = linhaMaterialSemNf(i221)
    expect(l.nf).toBe(287_838.08)
    expect(l.pedido).toBe(323_737.54)
    expect(l.semNf).toBe(28_952.36)
  })

  it('2.3.1: a MED-003 não teve pedido da FIP', () => {
    expect(linhaMaterialSemNf(i231).semNf).toBe(5_164.69)
  })

  it('pedido sem NF de item não medido não é sobra', () => {
    const r = montarRelatorioMaterialSemNf([i221, i231, i211], () => 'GERAÇÃO')
    expect(r.grupos).toHaveLength(1)
    const g = r.grupos[0]
    expect(g.semNf).toBe(34_117.05)
    expect(g.sobra).toBe(0)
    expect(g.itens.map(i => i.codigo)).toEqual(['2.2.1', '2.3.1'])
    expect(g.itensComSobra).toHaveLength(0)
  })

  it('NF lançada além do medido no vizinho aparece como sobra', () => {
    const hidrante = item({
      codigo: '2.9.1', materialContratado: 10_000, materialMedido: 2_000,
      fornecedores: [{ fornecedor: 'X', pedido: 10_000, nf: 10_000 }],
    })
    const g = montarRelatorioMaterialSemNf([i231, hidrante], () => 'G').grupos[0]
    expect(g.sobra).toBe(8_000)
    expect(g.itensComSobra.map(i => i.codigo)).toEqual(['2.9.1'])
  })

  it('macro item sem falta fica fora do relatório', () => {
    const r = montarRelatorioMaterialSemNf([i211], () => 'x')
    expect(r.grupos).toHaveLength(0)
    expect(r.totalSemNf).toBe(0)
  })
})
