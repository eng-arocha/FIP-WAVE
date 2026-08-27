import { describe, it, expect } from 'vitest'
import { calcularDescontoComTransbordo } from './desconto-transbordo'

/**
 * A regra de lançamento do Informakon, escrita pelo usuário, virada em teste.
 *
 * "Item com Material R$ 5.000 e Serviço R$ 5.000. Recebi R$ 3.000 em notas de
 *  material e executei 5% do serviço (R$ 250). Ao registrar 5%, o Informakon
 *  libera 5% sobre os R$ 10.000 = R$ 500. Eu preciso digitar manualmente um
 *  desconto de R$ 250 (o material correspondente aos 5%), senão ele libera
 *  R$ 500 em vez dos R$ 250 devidos."
 *
 * O boletim tem que produzir exatamente os dois números que ele digita: o
 * PERCENTUAL e o VALOR DO DESCONTO. Se qualquer um sair diferente, o
 * lançamento no ERP sai errado — e é dinheiro.
 */

const MATERIAL_CONTRATADO = 5_000
const SERVICO_CONTRATADO = 5_000
const GLOBAL = MATERIAL_CONTRATADO + SERVICO_CONTRATADO
const PCT_FISICO = 0.05

/** `a lançar = serviço medido + desconto + nota da FIP` (informacon-data.ts). */
function lancamento(servicoMedido: number, desconto: number, fipFaturar: number) {
  const aLancar = servicoMedido + desconto + fipFaturar
  return {
    aLancar,
    pct: (aLancar / GLOBAL) * 100,
    /** O ERP libera `a lançar` e o usuário digita o desconto por cima. */
    waveRecebe: aLancar - desconto - fipFaturar,
  }
}

describe('regra de lançamento do Informakon (exemplo do usuário)', () => {
  const servicoMedido = SERVICO_CONTRATADO * PCT_FISICO   // 250
  const materialMedido = MATERIAL_CONTRATADO * PCT_FISICO // 250

  it('com nota de R$ 3.000 lançada: digita 5% e desconta R$ 250', () => {
    const r = calcularDescontoComTransbordo([{
      detalhamentoId: 'A', grupoId: '1',
      matMedido: materialMedido, matAcumulado: materialMedido,
      nfAlocada: 3_000, nfJaAbatida: 0,
    }])
    const desconto = r.get('A')!.total

    // O desconto é o material dos 5% — não os R$ 3.000 da nota.
    expect(desconto).toBeCloseTo(250, 2)

    const l = lancamento(servicoMedido, desconto, 0)
    expect(l.pct).toBeCloseTo(5, 6)          // digita 5%, igual ao físico
    expect(l.aLancar).toBeCloseTo(500, 2)    // o ERP libera 500
    expect(l.waveRecebe).toBeCloseTo(250, 2) // sobra o serviço executado
  })

  it('sem nota lançada: a FIP precisa emitir exatamente R$ 250', () => {
    const r = calcularDescontoComTransbordo([{
      detalhamentoId: 'A', grupoId: '1',
      matMedido: materialMedido, matAcumulado: materialMedido,
      nfAlocada: 0, nfJaAbatida: 0,
    }])
    expect(r.get('A')!.total).toBeCloseTo(0, 2)

    // Gap = material medido − desconto. Sem pedido aprovado esperando nota,
    // o Gap inteiro vira "FIP precisa emitir".
    const gap = materialMedido - r.get('A')!.total
    const fipFaturar = gap
    expect(fipFaturar).toBeCloseTo(250, 2)

    const l = lancamento(servicoMedido, 0, fipFaturar)
    expect(l.pct).toBeCloseTo(5, 6)
    expect(l.waveRecebe).toBeCloseTo(250, 2)
  })

  it('nota menor que o material medido: desconta o que tem, a FIP emite o resto', () => {
    const r = calcularDescontoComTransbordo([{
      detalhamentoId: 'A', grupoId: '1',
      matMedido: materialMedido, matAcumulado: materialMedido,
      nfAlocada: 100, nfJaAbatida: 0,
    }])
    const desconto = r.get('A')!.total
    expect(desconto).toBeCloseTo(100, 2)

    const fipFaturar = materialMedido - desconto  // 150
    const l = lancamento(servicoMedido, desconto, fipFaturar)
    expect(l.pct).toBeCloseTo(5, 6)
    expect(l.waveRecebe).toBeCloseTo(250, 2)
  })

  it('a nota grande NÃO antecipa percentual: 5% continua 5%', () => {
    // Nota de 3.000 num item de 5.000 de material. Se a régua consumisse a
    // nota até o espaço contratual, o desconto seria 3.000 e o percentual
    // saltaria para 32,5% com 5% de obra feita.
    const r = calcularDescontoComTransbordo([{
      detalhamentoId: 'A', grupoId: '1',
      matMedido: materialMedido, matAcumulado: materialMedido,
      nfAlocada: 3_000, nfJaAbatida: 0,
    }])
    const l = lancamento(servicoMedido, r.get('A')!.total, 0)
    expect(l.pct).toBeLessThanOrEqual(PCT_FISICO * 100 + 1e-9)
  })

  it('o saldo do macro grupo compensa entre itens do mesmo grupo', () => {
    // Regra 1 do Informakon: o abatimento é pelo saldo consolidado do macro
    // grupo. Um item sem nota própria é coberto pela nota do vizinho — e
    // nenhum dos dois passa do próprio material executado.
    const r = calcularDescontoComTransbordo([
      { detalhamentoId: 'semNota', grupoId: '1', matMedido: 250, matAcumulado: 250, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'comNota', grupoId: '1', matMedido: 250, matAcumulado: 250, nfAlocada: 3_000, nfJaAbatida: 0 },
    ])
    expect(r.get('semNota')!.total).toBeCloseTo(250, 2)
    expect(r.get('comNota')!.total).toBeCloseTo(250, 2)
    // O grupo desconta 500 no total — o material executado do grupo, e só.
    expect(r.get('semNota')!.total + r.get('comNota')!.total).toBeCloseTo(500, 2)
  })
})
