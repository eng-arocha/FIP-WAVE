import { describe, it, expect } from 'vitest'
import { descontoIdealDoItem, descontoPendenteDeLastro } from './desconto-material'

/**
 * A camada ① passou a olhar o material ACUMULADO ainda não lançado, e não o
 * material do período. O caso que motivou a mudança é o item 1.8.1 da Medição
 * 5: 100% executado, cortado em R$ 50.291,03 por falta de lastro. No mês em
 * que a nota entra no Informakon o item não tem mais evolução física — se o
 * desconto saísse do período, seria zero para sempre.
 */
describe('desconto pendente de lastro', () => {
  it('num mês sem corte anterior é o material do período', () => {
    // Nada lançado antes, material acumulado = o do período.
    expect(descontoPendenteDeLastro(10_000, 0)).toBe(10_000)
  })

  it('carrega o que ficou de fora do mês anterior', () => {
    // Med 5: material acumulado 119.977,36, lançado só 69.686,33.
    const pendente = descontoPendenteDeLastro(119_977.36, 69_686.33)
    expect(pendente).toBeCloseTo(50_291.03, 2)
  })

  it('item 100% executado e sem evolução no mês ainda tem desconto', () => {
    // Med 6: nada foi medido, o acumulado não mudou, e o pendente continua.
    const matAcumulado = 119_977.36
    const jaLancado = 69_686.33
    expect(descontoIdealDoItem(descontoPendenteDeLastro(matAcumulado, jaLancado)))
      .toBeCloseTo(50_291.03, 2)
  })

  it('zera depois que o pendente foi lançado', () => {
    expect(descontoPendenteDeLastro(119_977.36, 119_977.36)).toBe(0)
  })

  it('nunca é negativo quando as aprovadas lançaram mais que o acumulado', () => {
    // Ajuste de quantidade para baixo depois de uma aprovação.
    expect(descontoPendenteDeLastro(80_000, 119_977.36)).toBe(0)
  })

  it('trata nulo e lixo como zero', () => {
    expect(descontoPendenteDeLastro(NaN as any, 10)).toBe(0)
    expect(descontoPendenteDeLastro(10_000, null as any)).toBe(10_000)
    expect(descontoPendenteDeLastro(undefined as any, undefined as any)).toBe(0)
  })
})

/**
 * O invariante que a mudança preserva. Ele é acumulado, não do período:
 *
 *     (p_acum × MO + desconto acumulado) / G  ≤  p_acum
 *
 * Vale por construção, porque `desconto acumulado = jaLancado + ideal` e o
 * ideal é limitado ao pendente, que é `matAcum − jaLancado`.
 */
describe('invariante: % acumulado a lançar nunca passa do físico acumulado', () => {
  const G = 200_000        // valor global do item
  const MO = 80_000        // mão de obra contratada
  const M = G - MO         // material contratado

  function pctAcumuladoALancar(pAcum: number, jaLancado: number, descontoAgora: number) {
    return (((pAcum / 100) * MO + jaLancado + descontoAgora) / G) * 100
  }

  it('com lastro cheio o percentual encosta no físico e não passa', () => {
    const pAcum = 100
    const jaLancado = 40_000
    const pendente = descontoPendenteDeLastro((pAcum / 100) * M, jaLancado)
    expect(pctAcumuladoALancar(pAcum, jaLancado, pendente)).toBeCloseTo(pAcum, 9)
  })

  it('com o corte da camada ② o percentual fica abaixo do físico', () => {
    const pAcum = 100
    const jaLancado = 40_000
    const pendente = descontoPendenteDeLastro((pAcum / 100) * M, jaLancado)
    const lastro = 30_000                       // o ERP só tem isto lançado
    const descontoAgora = Math.min(pendente, lastro)
    expect(pctAcumuladoALancar(pAcum, jaLancado, descontoAgora)).toBeLessThan(pAcum)
  })

  it('o mês de recuperação leva o acumulado exatamente ao físico', () => {
    // Mês 1: mediu 100% mas só teve lastro para 30.000.
    const pendenteMes1 = descontoPendenteDeLastro(M, 0)
    const lancadoMes1 = Math.min(pendenteMes1, 30_000)
    expect(pctAcumuladoALancar(100, 0, lancadoMes1)).toBeLessThan(100)

    // Mês 2: nenhuma evolução física, mas a nota entrou no ERP.
    const pendenteMes2 = descontoPendenteDeLastro(M, lancadoMes1)
    expect(pctAcumuladoALancar(100, lancadoMes1, pendenteMes2)).toBeCloseTo(100, 9)
  })
})
