import { describe, it, expect } from 'vitest'
import { descontoIdealDoItem, classificarCoberturaDoSite } from './desconto-material'
import { aplicarRetratoNasLinhas, type LinhaAjustavel } from '@/lib/informakon/aplicar-retrato'

/**
 * A regra de medição, nas três camadas, travada nos números reais.
 *
 * A referência é a Folha de Rosto da Medição 5 da engenheira responsável, cujas
 * fórmulas foram lidas do próprio arquivo e conferidas nas 48 linhas. Se algum
 * destes testes falhar, o boletim deixou de reproduzir o método dela.
 */

function linha(over: Partial<LinhaAjustavel> & { codigo: string }): LinhaAjustavel {
  return {
    wave_servico: 0,
    nf_descontavel: 0,
    gap_material: 0,
    dados_informakon: 0,
    valor_total_item: 0,
    ...over,
  }
}

describe('CAMADA ① — a medição, por item', () => {
  it('o desconto ideal é o material medido, e nada mais', () => {
    // Item de R$ 5.000 de material e R$ 5.000 de serviço, 5% executado.
    expect(descontoIdealDoItem(5_000 * 0.05)).toBe(250)
  })

  it('não é limitado pela nota que temos cadastrada', () => {
    // Quem limita é o lastro do ERP, na camada ②. Aqui o ideal é o ideal.
    expect(descontoIdealDoItem(11_057.26)).toBe(11_057.26)
  })

  it('material negativo por dado inconsistente não vira crédito', () => {
    expect(descontoIdealDoItem(-500)).toBe(0)
  })
})

describe('CAMADA ② — o teto do ERP decide o percentual', () => {
  it('grupo 1 da Medição 5: reproduz a planilha no centavo', () => {
    // 1.8.1: 100% de um item de 124.927,76 (material 119.977,36 + MO 4.950,40)
    // 1.14.1: 20% de um item de 25.619,67 (material 15.472,40)
    const l181 = linha({
      codigo: '1.8.1', wave_servico: 4_950.40, nf_descontavel: 119_977.36,
      dados_informakon: 124_927.76, valor_total_item: 124_927.76,
    })
    const l1141 = linha({
      codigo: '1.14.1', wave_servico: 2_029.45, nf_descontavel: 3_094.48,
      dados_informakon: 5_123.93, valor_total_item: 25_619.67,
    })
    const r = aplicarRetratoNasLinhas([l181, l1141], new Map([['1', 72_780.81]]))

    expect(r.total).toBe(50_291.03)
    expect(l181.informakon_a_lancar).toBe(74_636.73)      // = planilha
    expect(l181.pct_informakon_a_lancar).toBeCloseTo(59.74391, 4)
    expect(l1141.nf_descontavel).toBe(3_094.48)           // intacto
    // O desconto do grupo fecha EXATAMENTE com o lastro do ERP.
    expect(l181.nf_descontavel + l1141.nf_descontavel).toBeCloseTo(72_780.81, 2)
  })

  it('grupo 18 da Medição 5: reproduz a planilha no centavo', () => {
    const l186 = linha({
      codigo: '18.1.6', wave_servico: 7_708.44, nf_descontavel: 11_057.26,
      dados_informakon: 18_765.70, valor_total_item: 19_753.37,
    })
    const l1814 = linha({
      codigo: '18.1.14', wave_servico: 2_367.23, nf_descontavel: 2_110.59,
      dados_informakon: 4_477.83, valor_total_item: 53_733.91,
    })
    const r = aplicarRetratoNasLinhas([l186, l1814], new Map([['18', 3_265.48]]))

    expect(r.total).toBe(9_902.37)
    expect(l186.informakon_a_lancar).toBe(8_863.33)       // = planilha
    expect(l186.pct_informakon_a_lancar).toBeCloseTo(44.86996, 4)
    expect(l186.nf_descontavel + l1814.nf_descontavel).toBeCloseTo(3_265.48, 2)
  })

  it('grupo com lastro de sobra sai com o percentual físico', () => {
    // 5% de um item de 10.000 (material 5.000 + MO 5.000), nota de 3.000 lá.
    const l = linha({
      codigo: '1.1.1', wave_servico: 250, nf_descontavel: 250,
      dados_informakon: 500, valor_total_item: 10_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['1', 3_000]]))
    expect(l.informakon_a_lancar).toBe(500)
    expect(l.pct_informakon_a_lancar).toBeCloseTo(5, 6)   // = o físico
    expect(l.nf_nao_lancada_no_erp).toBe(0)
  })

  it('sem lastro nenhum: sobra o serviço, e só ele', () => {
    const l = linha({
      codigo: '1.1.1', wave_servico: 250, nf_descontavel: 250,
      dados_informakon: 500, valor_total_item: 10_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['1', 0]]))
    expect(l.nf_descontavel).toBe(0)
    expect(l.informakon_a_lancar).toBe(250)               // = p × MO
    expect(l.pct_informakon_a_lancar).toBeCloseTo(2.5, 6)
  })

  it('INVARIANTE: o percentual a lançar nunca passa do físico', () => {
    const casos: Array<[number | null, number]> = [[null, 0], [0, 0], [120, 0], [250, 0], [9_999, 0]]
    for (const [lastro] of casos) {
      const l = linha({
        codigo: '1.1.1', wave_servico: 250, nf_descontavel: 250,
        dados_informakon: 500, valor_total_item: 10_000,
      })
      const mapa = lastro === null ? new Map<string, number>() : new Map([['1', lastro]])
      aplicarRetratoNasLinhas([l], mapa)
      expect(l.pct_informakon_a_lancar!).toBeLessThanOrEqual(5 + 1e-9)
    }
  })

  it('macro item AUSENTE do retrato fica intocado — ausência não é lastro zero', () => {
    const l = linha({
      codigo: '17.1.1', wave_servico: 1_670.19, nf_descontavel: 4_064.61,
      dados_informakon: 5_734.80, valor_total_item: 55_722.71,
    })
    const r = aplicarRetratoNasLinhas([l], new Map([['14', 0]]))
    expect(r.total).toBe(0)
    expect(l.nf_descontavel).toBe(4_064.61)
  })

  it('a nota da FIP NÃO entra no a lançar', () => {
    // Mesmo item, com e sem "FIP precisa emitir": o percentual é o mesmo.
    const l = linha({
      codigo: '1.1.1', wave_servico: 250, nf_descontavel: 250,
      dados_informakon: 500, valor_total_item: 10_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['1', 250]]))
    expect(l.informakon_a_lancar).toBe(500)
  })
})

describe('CAMADA ③ — a nota da FIP não mexe no percentual, só na tarefa', () => {
  const cob = (matMedido: number, nf: number, aprovado: number) =>
    classificarCoberturaDoSite([{ detalhamentoId: 'A', matMedido, nfTerceiro: nf, pedidoAprovado: aprovado }]).get('A')!

  it('material já comprado: a FIP não emite nada', () => {
    // Grupo 1 da Medição 5: 73.057,03 de pedido aprovado esperando a nota.
    const r = cob(119_977.36, 46_920.33, 119_977.36)
    expect(r.fipPrecisaEmitir).toBe(0)
    expect(r.notaACaminho).toBeCloseTo(73_057.03, 2)
  })

  it('sem cobertura no site: a FIP emite a diferença', () => {
    // Grupo 18: saldo de pedido aprovado de R$ 0,01.
    const r = cob(11_057.26, 0, 0.01)
    expect(r.fipPrecisaEmitir).toBeCloseTo(11_057.25, 2)
  })

  it('cobertura parcial: emite só o que falta', () => {
    const r = cob(250, 100, 100)
    expect(r.fipPrecisaEmitir).toBe(150)
    expect(r.notaACaminho).toBe(0)
  })

  it('nota e pedido não somam duas vezes a mesma compra', () => {
    // O pedido aprovado de 3.000 já contém os 3.000 que viraram nota.
    const r = cob(250, 3_000, 3_000)
    expect(r.cobertura).toBe(3_000)
    expect(r.fipPrecisaEmitir).toBe(0)
  })

  it('pedido aprovado de um item não cobre o material do vizinho', () => {
    const m = classificarCoberturaDoSite([
      { detalhamentoId: 'semNada', matMedido: 250, nfTerceiro: 0, pedidoAprovado: 0 },
      { detalhamentoId: 'comPedido', matMedido: 250, nfTerceiro: 0, pedidoAprovado: 9_000 },
    ])
    expect(m.get('semNada')!.fipPrecisaEmitir).toBe(250)
    expect(m.get('comPedido')!.fipPrecisaEmitir).toBe(0)
  })
})
