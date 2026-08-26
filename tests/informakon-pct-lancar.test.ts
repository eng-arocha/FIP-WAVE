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
  /** Pedido aprovado sem nota — o que fica de fora do valor a lançar. */
  saldoAprovado?: number
}) {
  const { qtdMedida, qtdContratada, matUnit, servUnit, nfDescontavel } = args
  const matMedido = qtdMedida * matUnit
  const valorServicoTotalItem = qtdContratada * servUnit
  const valorGlobalItem = qtdContratada * (matUnit + servUnit)
  const pctServMed = qtdContratada > 0 ? (qtdMedida / qtdContratada) * 100 : 0
  const waveServico = (pctServMed / 100) * valorServicoTotalItem

  const dadosInformakon = waveServico + matMedido
  const pctInformakon = valorGlobalItem > 0 ? (dadosInformakon / valorGlobalItem) * 100 : 0

  // A lançar = Valor Total Medido − Nota a caminho.
  // Equivale a `wave + nfDescontavel + fipFaturar`: no momento em que o
  // percentual é digitado, a nota da FIP JÁ foi emitida e lançada (o
  // Informakon não desconta nota inexistente), então ela entra no valor.
  const valorTotalMedido = matMedido + waveServico
  const gap = Math.max(0, matMedido - nfDescontavel)
  const notaACaminho = Math.min(gap, args.saldoAprovado ?? 0)
  const fipFaturar = Math.max(0, gap - notaACaminho)
  // Soma as parcelas que o Informakon vai descontar. Equivale a
  // `valorTotalMedido − notaACaminho` sempre que a nota cabe no material do
  // período; na recuperação (nota > material medido) só esta forma se sustenta.
  const informakonALancar = waveServico + nfDescontavel + fipFaturar
  const pctALancar = valorGlobalItem > 0 ? (informakonALancar / valorGlobalItem) * 100 : 0
  const correcao = dadosInformakon - informakonALancar

  return {
    matMedido, waveServico, valorGlobalItem,
    pctServMed, pctInformakon, pctALancar,
    informakonALancar, correcao,
    gap, notaACaminho, fipFaturar,
    /**
     * O que a Wave recebe se este % for lançado. Desconta as DUAS notas
     * presentes no Informakon: a do fornecedor e a que a FIP emitiu.
     */
    waveRecebe: (pct: number) => (pct / 100) * valorGlobalItem - nfDescontavel - fipFaturar,
    /** Cenário de erro: a nota da FIP ainda não foi emitida/lançada. */
    waveRecebeSemNotaFip: (pct: number) => (pct / 100) * valorGlobalItem - nfDescontavel,
  }
}

describe('% a lançar no Informakon', () => {
  // Cenário do usuário: item 1.8.1 medido 100%, parte do material sem nota,
  // e um pedido aprovado cobrindo parte do que falta.
  const cenario = {
    qtdMedida: 1, qtdContratada: 1,
    matUnit: 100_000, servUnit: 20_000,
    nfDescontavel: 70_000,     // R$ 30 mil de material sem nota (o Gap)
    saldoAprovado: 18_000,     // desses 30 mil, 18 mil aguardam o fornecedor
  }

  it('o serviço continua pago pelo % medido integral', () => {
    const r = calcular(cenario)
    expect(r.pctServMed).toBe(100)
    expect(r.waveServico).toBe(20_000)
  })

  it('o Gap se reparte entre o que aguarda o fornecedor e o que é da FIP', () => {
    const r = calcular(cenario)
    expect(r.gap).toBeCloseTo(30_000, 2)
    expect(r.notaACaminho).toBeCloseTo(18_000, 2)
    expect(r.fipFaturar).toBeCloseTo(12_000, 2)
    expect(r.notaACaminho + r.fipFaturar).toBeCloseTo(r.gap, 2)
  })

  it('a lançar = Valor Total Medido − Nota a caminho', () => {
    const r = calcular(cenario)
    // 120.000 − 18.000 = 102.000
    expect(r.informakonALancar).toBeCloseTo(102_000, 2)
    expect(r.pctALancar).toBeCloseTo(85, 6)
  })

  it('é a mesma conta que Wave + NF Desc. + FIP precisa emitir', () => {
    const r = calcular(cenario)
    expect(r.informakonALancar).toBeCloseTo(r.waveServico + cenario.nfDescontavel + r.fipFaturar, 2)
  })

  it('entrega exatamente o serviço medido — as DUAS notas são descontadas lá', () => {
    const r = calcular(cenario)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('lançar o % espelho pagaria o "Nota a caminho" à Wave — é o vazamento', () => {
    const r = calcular(cenario)
    expect(r.pctInformakon).toBeCloseTo(100, 6)
    // Sobra o que ninguém vai faturar neste mês: o "Nota a caminho".
    expect(r.waveRecebe(r.pctInformakon) - r.waveServico).toBeCloseTo(r.notaACaminho, 2)
  })

  it('PRÉ-CONDIÇÃO: sem a nota da FIP lançada, a Wave recebe a mais', () => {
    const r = calcular(cenario)
    // O percentual está certo, mas o Informakon só desconta a nota do
    // fornecedor — sobra exatamente o "FIP precisa emitir".
    expect(r.waveRecebeSemNotaFip(r.pctALancar) - r.waveServico).toBeCloseTo(r.fipFaturar, 2)
  })

  it('a correção é exatamente o "Nota a caminho"', () => {
    const r = calcular(cenario)
    expect(r.correcao).toBeCloseTo(r.notaACaminho, 2)
  })

  it('material 100% coberto por nota: sem correção, e as colunas coincidem', () => {
    const r = calcular({ ...cenario, nfDescontavel: 100_000 })
    expect(r.gap).toBeCloseTo(0, 2)
    expect(r.correcao).toBeCloseTo(0, 2)
    expect(r.pctALancar).toBeCloseTo(r.pctInformakon, 6)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('sem pedido aprovado, nada é segurado — a FIP emite tudo', () => {
    const r = calcular({ ...cenario, saldoAprovado: 0 })
    expect(r.notaACaminho).toBe(0)
    expect(r.fipFaturar).toBeCloseTo(30_000, 2)
    expect(r.correcao).toBe(0)
    // Libera o executado inteiro — e as duas notas cobrem o material.
    expect(r.pctALancar).toBeCloseTo(100, 6)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('sem nota nenhuma e sem pedido: a FIP emite o material todo', () => {
    const r = calcular({ ...cenario, nfDescontavel: 0, saldoAprovado: 0 })
    expect(r.fipFaturar).toBeCloseTo(100_000, 2)
    expect(r.pctALancar).toBeCloseTo(100, 6)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(20_000, 2)
  })

  it('nota de meses anteriores voltando: libera mais que o executado no período', () => {
    const r = calcular({ ...cenario, qtdMedida: 0.1, nfDescontavel: 70_000, saldoAprovado: 0 })
    expect(r.matMedido).toBeCloseTo(10_000, 2)
    // Gap = 0 (a nota supera o material do período), nada é segurado — e o
    // valor a liberar precisa cobrir a nota inteira, não só o executado.
    expect(r.gap).toBeCloseTo(0, 2)
    expect(r.informakonALancar).toBeGreaterThan(r.matMedido + r.waveServico)
    expect(r.correcao).toBeLessThan(0)
    expect(r.waveRecebe(r.pctALancar)).toBeCloseTo(r.waveServico, 2)
  })

  it('item sem valor global não divide por zero', () => {
    const r = calcular({ qtdMedida: 1, qtdContratada: 0, matUnit: 0, servUnit: 0, nfDescontavel: 0 })
    expect(r.pctALancar).toBe(0)
    expect(Number.isFinite(r.pctALancar)).toBe(true)
  })
})

/**
 * Opção (a), 26/08/2026: a confirmação "sem mais NF" deixou de abater o
 * percentual de SERVIÇO. Com o "% a lançar" já excluindo o Gap inteiro do
 * lado do material, abater também no serviço tirava o mesmo Retido duas
 * vezes. A confirmação passou a apenas RECLASSIFICAR o Gap.
 */
function comConfirmacao(args: {
  matMedido: number
  servicoMedido: number
  nfDescontavel: number
  saldoAprovado: number
  confirmacaoSemNf: boolean
}) {
  const { matMedido, servicoMedido, nfDescontavel, saldoAprovado, confirmacaoSemNf } = args
  const gap = Math.max(0, matMedido - nfDescontavel)
  const retido = confirmacaoSemNf ? 0 : Math.min(gap, saldoAprovado)
  const fipFaturar = Math.max(0, gap - retido)
  // Serviço sempre integral — é a mudança da opção (a).
  const waveServico = servicoMedido
  return { gap, retido, fipFaturar, waveServico, aLancar: waveServico + nfDescontavel }
}

describe('confirmação "sem mais NF" — reclassifica, não reduz o serviço', () => {
  const base = { matMedido: 100_000, servicoMedido: 20_000, nfDescontavel: 70_000, saldoAprovado: 30_000 }

  it('sem confirmação: o Gap se divide entre Retido e FIP Fat-Dir', () => {
    const r = comConfirmacao({ ...base, confirmacaoSemNf: false })
    expect(r.gap).toBe(30_000)
    expect(r.retido).toBe(30_000)
    expect(r.fipFaturar).toBe(0)
    expect(r.retido + r.fipFaturar).toBe(r.gap)
  })

  it('com confirmação: o Gap inteiro vira FIP Fat-Dir', () => {
    const r = comConfirmacao({ ...base, confirmacaoSemNf: true })
    expect(r.gap).toBe(30_000)
    expect(r.retido).toBe(0)
    expect(r.fipFaturar).toBe(30_000)
    expect(r.retido + r.fipFaturar).toBe(r.gap)
  })

  it('o serviço é o mesmo com ou sem confirmação — sem desconto duplo', () => {
    const sem = comConfirmacao({ ...base, confirmacaoSemNf: false })
    const com = comConfirmacao({ ...base, confirmacaoSemNf: true })
    expect(com.waveServico).toBe(sem.waveServico)
    expect(com.waveServico).toBe(20_000)
  })

  it('o valor a lançar não muda: o Gap já estava fora nos dois casos', () => {
    const sem = comConfirmacao({ ...base, confirmacaoSemNf: false })
    const com = comConfirmacao({ ...base, confirmacaoSemNf: true })
    expect(com.aLancar).toBe(sem.aLancar)
    expect(com.aLancar).toBe(90_000)
  })

  it('a confirmação nunca muda o tamanho do Gap, só o lado', () => {
    for (const saldo of [0, 10_000, 30_000, 999_999]) {
      const sem = comConfirmacao({ ...base, saldoAprovado: saldo, confirmacaoSemNf: false })
      const com = comConfirmacao({ ...base, saldoAprovado: saldo, confirmacaoSemNf: true })
      expect(com.gap).toBe(sem.gap)
      expect(com.retido + com.fipFaturar).toBe(sem.retido + sem.fipFaturar)
    }
  })
})
