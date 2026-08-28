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

/**
 * CAMADA ③ depois do corte — a FIP só emite onde não há lastro no ERP nem
 * pedido no site.
 *
 * A camada ③ mede cobertura pelo SITE. O desconto que a camada ② deixa passar
 * é, por construção, nota que o ERP TEM lançada. Onde o Informakon tem nota
 * que o nosso cadastro não tem, a camada ③ pedia à FIP uma SEGUNDA nota para
 * o mesmo material. Números reais da Medição 5.
 */
describe('CAMADA ③ — a nota da FIP depois do corte', () => {
  it('4.2.4: desconto integralmente lastreado zera a emissão', () => {
    // Material 4.453,17, sem nota nem pedido no site — a camada ③ pedia tudo.
    // Mas o grupo 4 tem lastro para o desconto inteiro: a nota existe no ERP.
    const l = linha({
      codigo: '4.2.4', wave_servico: 6_764.62, nf_descontavel: 4_453.17,
      desconto_ideal: 4_453.17, fip_faturar: 4_453.17, valor_total_item: 12_464.21,
    })
    const r = aplicarRetratoNasLinhas([l], new Map([['4', 4_453.17]]))
    expect(l.fip_faturar).toBe(0)
    expect(r.fipAbatidoPeloLastro).toBeCloseTo(4_453.17, 2)
  })

  it('18.1.6: a FIP emite exatamente o que foi cortado', () => {
    // Grupo 18: desconto ideal 13.167,85 contra lastro de 3.265,48.
    const l186 = linha({
      codigo: '18.1.6', wave_servico: 7_708.44, nf_descontavel: 11_057.26,
      desconto_ideal: 11_057.26, fip_faturar: 11_057.26, valor_total_item: 19_753.37,
    })
    const l1814 = linha({
      codigo: '18.1.14', wave_servico: 2_367.23, nf_descontavel: 2_110.60,
      desconto_ideal: 2_110.60, fip_faturar: 0, valor_total_item: 53_733.96,
    })
    aplicarRetratoNasLinhas([l186, l1814], new Map([['18', 3_265.48]]))
    // O corte cai no maior desconto: 11.057,26 − 9.902,38 = 1.154,88.
    expect(l186.nf_descontavel).toBeCloseTo(1_154.88, 2)
    // E é exatamente isso que a FIP emite — o mesmo número da Folha de Rosto.
    expect(l186.fip_faturar).toBeCloseTo(9_902.38, 2)
  })

  it('pedido aprovado no site segura a emissão mesmo com corte', () => {
    // Grupo 1: cortado em 50.291,03, mas há 73.057,03 de pedido aprovado —
    // a nota do fornecedor está a caminho, a FIP não emite nada.
    const l = linha({
      codigo: '1.8.1', wave_servico: 4_950.40, nf_descontavel: 119_977.36,
      desconto_ideal: 119_977.36, fip_faturar: 0, valor_total_item: 124_927.76,
    })
    aplicarRetratoNasLinhas([l], new Map([['1', 69_686.33]]))
    expect(l.nf_descontavel).toBeCloseTo(69_686.33, 2)
    expect(l.fip_faturar).toBe(0)
  })

  it('grupo AUSENTE do retrato não abate a emissão', () => {
    // A trava que impede transformar falta de informação em prova de que o
    // material já foi faturado. Sem o grupo no retrato, nada foi conferido.
    const l = linha({
      codigo: '4.2.4', wave_servico: 6_764.62, nf_descontavel: 4_453.17,
      desconto_ideal: 4_453.17, fip_faturar: 4_453.17, valor_total_item: 12_464.21,
    })
    const r = aplicarRetratoNasLinhas([l], new Map())
    expect(l.fip_faturar).toBe(4_453.17)
    expect(r.fipAbatidoPeloLastro).toBe(0)
  })

  it('nunca aumenta a emissão — o abatimento é um teto, não um cálculo novo', () => {
    // Item com pedido cobrindo metade: a camada ③ pedia 1.000 e o corte foi
    // 4.000. O `min` preserva o número menor, que é o da cobertura do site.
    const l = linha({
      codigo: '9.1.1', wave_servico: 1_000, nf_descontavel: 6_000,
      desconto_ideal: 10_000, fip_faturar: 1_000, valor_total_item: 20_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['9', 6_000]]))
    expect(l.fip_faturar).toBe(1_000)
  })
})

/**
 * A recuperação cede o lastro antes do material do mês.
 *
 * Números reais do grupo 18 da Medição 5 depois que o pendente de lastro
 * entrou: 18.1.5 e parte do 18.1.14 são material de medições anteriores e
 * disputavam o mesmo lastro de R$ 3.265,48. Disputando de igual para igual,
 * a cascata pelo maior desconto fazia o 18.1.6 — material DESTE mês — cair de
 * 1.154,88 para 583,77.
 */
describe('prioridade — o mês corrente antes da recuperação', () => {
  const grupo18 = () => [
    // Só material do mês.
    linha({
      codigo: '18.1.6', wave_servico: 7_708.44, nf_descontavel: 11_057.26,
      material_medido: 11_057.26, desconto_ideal: 11_057.26,
      fip_faturar: 11_057.26, valor_total_item: 19_753.37,
    }),
    // 2.110,60 do mês + 342,48 de meses anteriores.
    linha({
      codigo: '18.1.14', wave_servico: 2_367.23, nf_descontavel: 2_453.08,
      material_medido: 2_110.60, desconto_ideal: 2_453.08,
      fip_faturar: 0, valor_total_item: 53_733.96,
    }),
    // Linha de recuperação pura: nada foi medido no mês.
    linha({
      codigo: '18.1.5', wave_servico: 0, nf_descontavel: 228.64,
      material_medido: 0, desconto_ideal: 228.64,
      fip_faturar: 0, valor_total_item: 19_753.37,
    }),
  ]

  it('a recuperação é cortada primeiro e o item do mês volta ao valor da planilha', () => {
    const [l186, l1814, l185] = grupo18()
    aplicarRetratoNasLinhas([l186, l1814, l185], new Map([['18', 3_265.48]]))
    expect(l185.nf_descontavel).toBe(0)                    // recuperação pura cede tudo
    expect(l1814.nf_descontavel).toBeCloseTo(2_110.60, 2)  // sobra só o material do mês
    expect(l186.nf_descontavel).toBeCloseTo(1_154.88, 2)   // o número da Folha de Rosto
    expect(l186.fip_faturar).toBeCloseTo(9_902.38, 2)
  })

  it('o total lançado do grupo não muda — só a distribuição', () => {
    const itens = grupo18()
    aplicarRetratoNasLinhas(itens, new Map([['18', 3_265.48]]))
    const soma = itens.reduce((s, l) => s + l.nf_descontavel, 0)
    expect(soma).toBeCloseTo(3_265.48, 2)
  })

  it('sem pendente o resultado é idêntico ao da cascata de antes', () => {
    // Grupo 1 da Medição 5, tudo material do período.
    const l181 = linha({
      codigo: '1.8.1', wave_servico: 4_950.40, nf_descontavel: 119_977.36,
      material_medido: 119_977.36, valor_total_item: 124_927.76,
    })
    const l1141 = linha({
      codigo: '1.14.1', wave_servico: 2_029.45, nf_descontavel: 3_094.48,
      material_medido: 3_094.48, valor_total_item: 25_619.67,
    })
    aplicarRetratoNasLinhas([l181, l1141], new Map([['1', 72_780.81]]))
    expect(l181.nf_descontavel).toBeCloseTo(69_686.33, 2)
    expect(l1141.nf_descontavel).toBeCloseTo(3_094.48, 2)
  })

  it('recuperação maior que a falta não derruba o material do mês', () => {
    // Falta 500; a recuperação sozinha (800) já cobre — o mês fica intacto.
    const mes = linha({
      codigo: '9.1.1', wave_servico: 1_000, nf_descontavel: 2_000,
      material_medido: 2_000, valor_total_item: 10_000,
    })
    const rec = linha({
      codigo: '9.1.2', wave_servico: 0, nf_descontavel: 800,
      material_medido: 0, valor_total_item: 10_000,
    })
    aplicarRetratoNasLinhas([mes, rec], new Map([['9', 2_300]]))
    expect(mes.nf_descontavel).toBe(2_000)
    expect(rec.nf_descontavel).toBe(300)
  })
})
