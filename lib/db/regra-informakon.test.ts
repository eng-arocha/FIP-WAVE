import { describe, it, expect } from 'vitest'
import { descontoIdealDoItem, classificarCoberturaDoSite } from './desconto-material'
import { aplicarRetratoNasLinhas, baseALancar, lastroFipEmLancamento, recuperadoDeMedicoesAnteriores, type LinhaAjustavel } from '@/lib/informakon/aplicar-retrato'

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
 * CAMADA ③ depois do corte — o retrato do ERP não mexe na FIP (29/10/2026).
 *
 * Antes o retrato abatia o desconto lastreado da FIP e somava um piso por
 * grupo. Os dois compensavam no macro item (MED-007: R$ 153 mil no 1.3.1,
 * acima do contratado). A FIP agora é item a item, contra o site.
 */
describe('CAMADA ③ — o retrato não altera a FIP', () => {
  it('desconto integralmente lastreado não zera a emissão (4.2.4)', () => {
    const l = linha({
      codigo: '4.2.4', wave_servico: 6_764.62, nf_descontavel: 4_453.17,
      desconto_ideal: 4_453.17, fip_faturar: 4_453.17, valor_total_item: 12_464.21,
    })
    aplicarRetratoNasLinhas([l], new Map([['4', 4_453.17]]))
    expect(l.fip_faturar).toBe(4_453.17)
  })

  it('corte sem nota a caminho não cria FIP no grupo (MED-007 grupo 1)', () => {
    const l131 = linha({
      codigo: '1.3.1', wave_servico: 0, nf_descontavel: 320_380.45, desconto_ideal: 320_380.45,
      fip_faturar: 0, faturamento_direto_em_aberto: 17_625.35, valor_total_item: 400_000,
    })
    const l161 = linha({
      codigo: '1.6.1', wave_servico: 0, nf_descontavel: 216_610.84, desconto_ideal: 216_610.84,
      fip_faturar: 0, faturamento_direto_em_aberto: 14_291.23, valor_total_item: 300_000,
    })
    aplicarRetratoNasLinhas([l131, l161], new Map([['1', 351_603.47]]))
    expect(l131.fip_faturar).toBe(0)
    expect(l161.fip_faturar).toBe(0)
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

/**
 * Decisão do usuário (26/10/2026), MED-007: autorizada a NF de material da
 * FIP (portão 1), o "% a lançar" já sai considerando ela — o portão 2 garante
 * que ela está no Informakon antes da medição ser digitada lá.
 */
describe('CAMADA ② — NF de material FIP autorizada entra como lastro', () => {
  it('soma o pedido FIP pendente por macro item', () => {
    const r = lastroFipEmLancamento(
      { a: 153_471.24, b: 35_268.99, c: 0 },
      new Map([['a', '1.3.1'], ['b', '2.2.1'], ['c', '4.2.1']]),
    )
    expect(r.get('1')).toBeCloseTo(153_471.24, 2)
    expect(r.get('2')).toBeCloseTo(35_268.99, 2)
    expect(r.has('4')).toBe(false)
  })

  it('MED-007: o corte de SUBESTAÇÃO cai para a nota de fornecedor a caminho', () => {
    const l = linha({
      codigo: '1.3.1', wave_servico: 0, nf_descontavel: 536_991.29, desconto_ideal: 536_991.29,
      fip_faturar: 0, faturamento_direto_em_aberto: 185_387.82, valor_total_item: 683_545.03,
    })
    const r = aplicarRetratoNasLinhas([l], new Map([['1', 351_603.47 + 153_471.24]]))
    expect(r.total).toBeCloseTo(31_916.58, 2)
    expect(l.fip_faturar).toBe(0)
  })
})

describe('recuperação — o corte de uma medição volta quando a nota entra', () => {
  // MED-007, 1.3.1: R$ 31.916,58 cortados por falta de lastro (MSF/Cordeiro).
  // Na medição seguinte o desconto ideal traz esse valor junto com o material
  // do período.
  const linha = (): LinhaAjustavel & { material_medido: number } => ({
    codigo: '1.3.1',
    wave_servico: 10_000,
    material_medido: 20_000,
    nf_descontavel: 20_000 + 31_916.58,
    gap_material: 0,
    valor_total_item: 1_000_000,
    dados_informakon: 0,
  })

  it('nota entrou: o desconto passa inteiro e a recuperação aparece', () => {
    const l = linha()
    aplicarRetratoNasLinhas([l], new Map([['1', 60_000]]))
    expect(l.nf_nao_lancada_no_erp).toBe(0)
    expect(recuperadoDeMedicoesAnteriores(l)).toBe(31_916.58)
  })

  it('nota ainda não entrou: a recuperação é cortada primeiro e não aparece', () => {
    const l = linha()
    aplicarRetratoNasLinhas([l], new Map([['1', 20_000]]))
    expect(l.nf_nao_lancada_no_erp).toBe(31_916.58)
    expect(recuperadoDeMedicoesAnteriores(l)).toBe(0)
  })

  it('nota entrou em parte: aparece só o que passou', () => {
    const l = linha()
    aplicarRetratoNasLinhas([l], new Map([['1', 30_000]]))
    expect(recuperadoDeMedicoesAnteriores(l)).toBe(10_000)
  })
})

describe('% real (migration 086) — o corte vira desconto posterior', () => {
  // 1.3.1 da MED-007: material 320.380,45, lastro do grupo só 288.463,87 (sem
  // as notas da MSF/Cordeiro). Serviço fictício de 30.000 para o item fechar
  // em 100%.
  const med7 = (): LinhaAjustavel & { material_medido: number } => ({
    codigo: '1.3.1',
    wave_servico: 30_000,
    material_medido: 320_380.45,
    nf_descontavel: 320_380.45,
    gap_material: 0,
    valor_total_item: 350_380.45,
    dados_informakon: 350_380.45,
  })

  it('MED-007: lança 100% e desconta só o que tem lastro', () => {
    const l = med7()
    aplicarRetratoNasLinhas([l], new Map([['1', 288_463.87]]), { pctReal: true })
    expect(l.pct_informakon_a_lancar).toBeCloseTo(100, 6)
    expect(l.informakon_a_lancar).toBe(350_380.45)
    expect(l.nf_descontavel).toBe(288_463.87)
    // O que ficou sem desconto é o pendente da MSF/Cordeiro.
    expect(l.gap_material).toBe(31_916.58)
    expect(l.correcao_informakon).toBe(0)
  })

  it('regra antiga, mesmo item: o corte baixa o percentual (90,89%)', () => {
    const l = med7()
    aplicarRetratoNasLinhas([l], new Map([['1', 288_463.87]]))
    expect(l.informakon_a_lancar).toBe(318_463.87)
    expect(l.pct_informakon_a_lancar).toBeCloseTo(90.8908, 3)
  })

  it('MED-008: a nota entra, desconta 31.916,58 sem mexer no percentual', () => {
    // Item sem evolução: pendente da camada ① = 320.380,45 − 288.463,87.
    const l: LinhaAjustavel & { material_medido: number } = {
      codigo: '1.3.1', wave_servico: 0, material_medido: 0,
      nf_descontavel: 31_916.58, gap_material: 0,
      valor_total_item: 350_380.45, dados_informakon: 0,
    }
    aplicarRetratoNasLinhas([l], new Map([['1', 31_916.58]]), { pctReal: true })
    expect(l.nf_descontavel).toBe(31_916.58)
    expect(l.informakon_a_lancar).toBe(0)
    expect(l.pct_informakon_a_lancar).toBe(0)
    expect(recuperadoDeMedicoesAnteriores(l)).toBe(31_916.58)
  })

  it('MED-008 sem a nota: nada é descontado e o pendente segue', () => {
    const l: LinhaAjustavel & { material_medido: number } = {
      codigo: '1.3.1', wave_servico: 0, material_medido: 0,
      nf_descontavel: 31_916.58, gap_material: 0,
      valor_total_item: 350_380.45, dados_informakon: 0,
    }
    aplicarRetratoNasLinhas([l], new Map([['1', 0]]), { pctReal: true })
    expect(l.nf_descontavel).toBe(0)
    expect(l.gap_material).toBe(31_916.58)
    expect(l.informakon_a_lancar).toBe(0)
  })

  it('baseALancar: sem material do período cai na regra antiga', () => {
    expect(baseALancar({ wave_servico: 10, nf_descontavel: 5 }, true)).toBe(15)
    expect(baseALancar({ wave_servico: 10, nf_descontavel: 5, material_medido: 8 }, true)).toBe(18)
    expect(baseALancar({ wave_servico: 10, nf_descontavel: 5, material_medido: 8 }, false)).toBe(15)
  })
})
