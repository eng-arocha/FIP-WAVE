import { describe, it, expect } from 'vitest'

/**
 * A conta do "% a lançar" do boletim Informakon.
 *
 * Mecânica do Informakon: ao receber um percentual ele LIBERA
 * `% × valor global do item` e depois desconta as notas de material lançadas
 * lá — nada mais. Logo:
 *
 *     Wave recebe = % × valor global − NF lançada
 *
 * O percentual correto é o que faz a Wave receber exatamente o serviço
 * medido. Estes testes fixam essa identidade — se ela quebrar, a Wave passa a
 * receber material que não é dela (ou fica no negativo).
 */

function calcular(args: {
  qtdMedida: number
  qtdContratada: number
  matUnit: number
  servUnit: number
  nfDescontavel: number
}) {
  const { qtdMedida, qtdContratada, matUnit, servUnit, nfDescontavel } = args
  const matMedido = qtdMedida * matUnit
  const valorServicoTotalItem = qtdContratada * servUnit
  const valorGlobalItem = qtdContratada * (matUnit + servUnit)
  const pctServMed = qtdContratada > 0 ? (qtdMedida / qtdContratada) * 100 : 0
  const waveServico = (pctServMed / 100) * valorServicoTotalItem

  const dadosInformakon = waveServico + matMedido
  const pctInformakon = valorGlobalItem > 0 ? (dadosInformakon / valorGlobalItem) * 100 : 0

  const informakonALancar = waveServico + nfDescontavel
  const pctALancar = valorGlobalItem > 0 ? (informakonALancar / valorGlobalItem) * 100 : 0
  const correcao = dadosInformakon - informakonALancar

  return {
    matMedido, waveServico, valorGlobalItem,
    pctServMed, pctInformakon, pctALancar,
    informakonALancar, correcao,
    gap: Math.max(0, matMedido - nfDescontavel),
    /** O que a Wave de fato recebe se este % for lançado. */
    waveRecebe: (pct: number) => (pct / 100) * valorGlobalItem - nfDescontavel,
  }
}

describe('% a lançar no Informakon', () => {
  // Cenário do usuário: item 1.8.1 medido 100%, parte do material sem nota.
  const cenario = {
    qtdMedida: 1, qtdContratada: 1,
    matUnit: 100_000, servUnit: 20_000,
    nfDescontavel: 70_000,          // R$ 30 mil de material sem nota (o Gap)
  }

  it('o serviço continua pago pelo % medido integral', () => {
    const r = calcular(cenario)
    expect(r.pctServMed).toBe(100)
    expect(r.waveServico).toBe(20_000)
  })

  it('lançar o % espelho pagaria o Gap à Wave — é o vazamento', () => {
    const r = calcular(cenario)
    // espelho = (20.000 + 100.000) / 120.000 = 100%
    expect(r.pctInformakon).toBeCloseTo(100, 6)
    // ...e a Wave receberia 120.000 − 70.000 = 50.000, R$ 30 mil a mais.
    expect(r.waveRecebe(r.pctInformakon)).toBeCloseTo(50_000, 2)
    expect(r.waveRecebe(r.pctInformakon) - r.waveServico).toBeCloseTo(r.gap, 2)
  })

  it('o % a lançar entrega exatamente o serviço medido', () => {
    const r = calcular(cenario)
    // (20.000 + 70.000) / 120.000 = 75%
    expect(r.pctALancar).toBeCloseTo(75, 6)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('a correção é exatamente o Gap (Retido + FIP Fat-Dir)', () => {
    const r = calcular(cenario)
    expect(r.correcao).toBeCloseTo(30_000, 2)
    expect(r.correcao).toBeCloseTo(r.gap, 2)
  })

  it('material 100% coberto por nota: as duas colunas coincidem', () => {
    const r = calcular({ ...cenario, nfDescontavel: 100_000 })
    expect(r.correcao).toBeCloseTo(0, 2)
    expect(r.pctALancar).toBeCloseTo(r.pctInformakon, 6)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('nota de meses anteriores voltando: corrige para CIMA, senão a Wave fica negativa', () => {
    // Régua acumulada devolve mais nota do que o material medido no período.
    const r = calcular({ ...cenario, qtdMedida: 0.1, nfDescontavel: 70_000 })
    expect(r.matMedido).toBeCloseTo(10_000, 2)
    expect(r.correcao).toBeLessThan(0)              // libera MAIS que o executado
    expect(r.waveRecebe(r.pctInformakon)).toBeLessThan(0)   // o espelho quebraria
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('sem nota nenhuma, o Informakon libera só o serviço', () => {
    const r = calcular({ ...cenario, nfDescontavel: 0 })
    // (20.000 + 0) / 120.000 = 16,666...%
    expect(r.pctALancar).toBeCloseTo(16.6667, 3)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(20_000, 2)
    expect(r.correcao).toBeCloseTo(100_000, 2)
  })

  it('item sem valor global não divide por zero', () => {
    const r = calcular({ qtdMedida: 1, qtdContratada: 0, matUnit: 0, servUnit: 0, nfDescontavel: 0 })
    expect(r.pctALancar).toBe(0)
    expect(Number.isFinite(r.pctALancar)).toBe(true)
  })
})
