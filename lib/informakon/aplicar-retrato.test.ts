import { describe, it, expect } from 'vitest'
import { aplicarRetratoNasLinhas, type LinhaAjustavel } from './aplicar-retrato'

/** Linha de boletim com os campos que o ajuste lê. */
function linha(over: Partial<LinhaAjustavel> & { codigo: string }): LinhaAjustavel {
  const base: LinhaAjustavel = {
    codigo: over.codigo,
    wave_servico: 0,
    nf_descontavel: 0,
    gap_material: 0,
    fip_faturar: 0,
    faturamento_direto_em_aberto: 0,
    dados_informakon: 0,
    valor_total_item: 0,
  }
  return { ...base, ...over }
}

describe('aplicarRetratoNasLinhas', () => {
  it('reclassifica só a parcela que o ERP não tem', () => {
    const l = linha({
      codigo: '14.1.1',
      wave_servico: 100_000,
      nf_descontavel: 511_015.55,
      gap_material: 0,
      dados_informakon: 611_015.55,
      valor_total_item: 1_000_000,
    })
    const resumo = aplicarRetratoNasLinhas([l], new Map([['14', 481_745.48]]))

    expect(resumo.total).toBe(29_270.07)
    expect(l.nf_nao_lancada_no_erp).toBe(29_270.07)
    expect(l.nf_descontavel).toBe(481_745.48)
    expect(l.gap_material).toBe(29_270.07)
  })

  it('o % a lançar cai exatamente na diferença — nem mais, nem menos', () => {
    const comum = {
      codigo: '14.1.1', wave_servico: 100_000, nf_descontavel: 511_015.55,
      dados_informakon: 611_015.55, valor_total_item: 1_000_000,
    }
    const antes = linha({ ...comum })
    aplicarRetratoNasLinhas([antes], new Map())
    const depois = linha({ ...comum })
    aplicarRetratoNasLinhas([depois], new Map([['14', 481_745.48]]))

    expect(antes.informakon_a_lancar).toBe(611_015.55)
    expect(depois.informakon_a_lancar).toBe(581_745.48)
    expect(antes.informakon_a_lancar! - depois.informakon_a_lancar!).toBeCloseTo(29_270.07, 2)
    expect(depois.pct_informakon_a_lancar).toBeCloseTo(58.174548, 6)
  })

  it('a Wave recebe o serviço medido, e só ele', () => {
    const l = linha({
      codigo: '14.1.1', wave_servico: 100_000, nf_descontavel: 511_015.55,
      dados_informakon: 611_015.55, valor_total_item: 1_000_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['14', 481_745.48]]))
    // O ERP libera `informakon_a_lancar` e desconta o que tem lançado.
    const lancadoNoErp = 481_745.48
    expect(l.informakon_a_lancar! - lancadoNoErp - l.fip_faturar).toBeCloseTo(100_000, 2)
  })

  it('rateia a falta entre os detalhamentos na proporção do desconto', () => {
    const a = linha({ codigo: '4.1.1', nf_descontavel: 45_000, valor_total_item: 100_000 })
    const b = linha({ codigo: '4.1.2', nf_descontavel: 15_000, valor_total_item: 100_000 })
    const c = linha({ codigo: '4.2.1', nf_descontavel: 6_017.51, valor_total_item: 100_000 })
    const resumo = aplicarRetratoNasLinhas([a, b, c], new Map([['4', 45_027.42]]))

    expect(resumo.total).toBe(20_990.09)
    const soma = [a, b, c].reduce((s, l) => s + (l.nf_nao_lancada_no_erp ?? 0), 0)
    expect(Math.round(soma * 100) / 100).toBe(20_990.09)
    // Proporcional: a linha maior absorve a maior parte.
    expect(a.nf_nao_lancada_no_erp!).toBeGreaterThan(b.nf_nao_lancada_no_erp!)
    expect(b.nf_nao_lancada_no_erp!).toBeGreaterThan(c.nf_nao_lancada_no_erp!)
    // E a soma dos descontos ajustados bate com o que existe no ERP.
    const desc = [a, b, c].reduce((s, l) => s + l.nf_descontavel, 0)
    expect(Math.round(desc * 100) / 100).toBe(45_027.42)
  })

  it('nunca reclassifica mais do que a linha pede de desconto', () => {
    const a = linha({ codigo: '9.1.1', nf_descontavel: 10, valor_total_item: 1000 })
    const b = linha({ codigo: '9.1.2', nf_descontavel: 0.01, valor_total_item: 1000 })
    aplicarRetratoNasLinhas([a, b], new Map([['9', 0]]))
    expect(a.nf_descontavel).toBeGreaterThanOrEqual(0)
    expect(b.nf_descontavel).toBeGreaterThanOrEqual(0)
    expect(a.nf_nao_lancada_no_erp!).toBeLessThanOrEqual(10)
  })

  it('macro item com folga no ERP não é tocado', () => {
    const l = linha({
      codigo: '10.1.1', wave_servico: 50, nf_descontavel: 1_000,
      dados_informakon: 1_050, valor_total_item: 2_000,
    })
    const resumo = aplicarRetratoNasLinhas([l], new Map([['10', 5_000]]))
    expect(resumo.total).toBe(0)
    expect(l.nf_descontavel).toBe(1_000)
    expect(l.nf_nao_lancada_no_erp).toBe(0)
    expect(l.informakon_a_lancar).toBe(1_050)
  })

  it('macro item AUSENTE do retrato fica intocado — ausência não é zero', () => {
    const l = linha({ codigo: '17.1.1', nf_descontavel: 9_000, valor_total_item: 20_000 })
    const resumo = aplicarRetratoNasLinhas([l], new Map([['14', 0]]))
    expect(resumo.total).toBe(0)
    expect(l.nf_descontavel).toBe(9_000)
  })

  it('o grupo 19 compara por detalhamento, não por grupo', () => {
    const l1 = linha({ codigo: '19.1.1', nf_descontavel: 50_000, valor_total_item: 100_000 })
    const l2 = linha({ codigo: '19.1.2', nf_descontavel: 30_000, valor_total_item: 100_000 })
    aplicarRetratoNasLinhas([l1, l2], new Map([['19.1.2', 20_000]]))
    expect(l1.nf_descontavel).toBe(50_000)
    expect(l2.nf_descontavel).toBe(20_000)
    expect(l2.nf_nao_lancada_no_erp).toBe(10_000)
  })

  it('Gap continua fechando: Gap = Nota a caminho + FIP emite + não lançada', () => {
    const l = linha({
      codigo: '14.1.1', wave_servico: 10, nf_descontavel: 1_000, gap_material: 300,
      faturamento_direto_em_aberto: 200, fip_faturar: 100,
      dados_informakon: 1_310, valor_total_item: 5_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['14', 400]]))
    expect(l.gap_material).toBe(900)
    expect(l.faturamento_direto_em_aberto + l.fip_faturar + l.nf_nao_lancada_no_erp!).toBe(900)
  })

  it('"Nota a caminho" cresce no total segurado, e o a lançar cai junto', () => {
    const l = linha({
      codigo: '14.1.1', wave_servico: 10, nf_descontavel: 1_000, gap_material: 300,
      faturamento_direto_em_aberto: 200, fip_faturar: 100,
      dados_informakon: 1_310, valor_total_item: 5_000,
    })
    aplicarRetratoNasLinhas([l], new Map([['14', 400]]))
    expect(l.informakon_a_lancar).toBe(510)          // 10 + 400 + 100
    expect(l.correcao_informakon).toBe(800)          // 1310 − 510
  })
})
