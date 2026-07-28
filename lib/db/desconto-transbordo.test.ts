import { describe, it, expect } from 'vitest'
import {
  calcularDescontoComTransbordo,
  calcularSaldoAprovadoComTransbordo,
  type ItemDesconto,
  type ItemSaldoAprovado,
} from './desconto-transbordo'

/**
 * Testes de `calcularDescontoComTransbordo`.
 *
 * Contexto de negócio: a FIP compra material por lote — um pedido de tubo
 * cobre a prumada inteira — mas a Wave mede por pavimento. Quando a NF está
 * amarrada ao detalhamento "PRUMADA VERTICAL" e a medição acontece em
 * "SUBSOLO 1", o desconto item-a-item não acha a nota: sobra saldo num
 * detalhamento e falta no vizinho do mesmo grupo macro. A função faz esse
 * saldo ocioso transbordar para cobrir o material medido dos vizinhos —
 * mas só dentro do MESMO grupo macro.
 */

/** Embaralha um array sem mutar o original (Fisher-Yates com seed fixa via índice reverso simples). */
function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(((i + 1) * 2654435761) % (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

describe('sem transbordo necessário', () => {
  it('cada item com NF suficiente não gera transbordo — total = direto', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'a', grupoId: 'g1', matMedido: 100, matAcumulado: 100, nfAlocada: 150, nfJaAbatida: 0 },
      { detalhamentoId: 'b', grupoId: 'g1', matMedido: 200, matAcumulado: 200, nfAlocada: 200, nfJaAbatida: 0 },
      { detalhamentoId: 'c', grupoId: 'g2', matMedido: 50, matAcumulado: 50, nfAlocada: 60, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    expect(resultado.get('a')).toEqual({ direto: 100, transbordo: 0, recuperacao: 0, total: 100 })
    expect(resultado.get('b')).toEqual({ direto: 200, transbordo: 0, recuperacao: 0, total: 200 })
    expect(resultado.get('c')).toEqual({ direto: 50, transbordo: 0, recuperacao: 0, total: 50 })
  })
})

describe('transbordo simples dentro do grupo', () => {
  it('item sem NF é coberto pela sobra ociosa do vizinho do mesmo grupo', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'A', grupoId: 'g1', matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'B', grupoId: 'g1', matMedido: 0, matAcumulado: 0, nfAlocada: 100, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const a = resultado.get('A')!
    expect(a.direto).toBeCloseTo(0, 2)
    expect(a.transbordo).toBeCloseTo(100, 2)
    expect(a.total).toBeCloseTo(100, 2)

    const b = resultado.get('B')!
    expect(b.direto).toBeCloseTo(0, 2)
    expect(b.transbordo).toBeCloseTo(0, 2)
    expect(b.total).toBeCloseTo(0, 2)
  })
})

describe('caso real da medição 004', () => {
  it('14.2.6 transborda a NF ociosa de 14.2.1 (mesmo grupo 14) e zera o gap', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: '14.2.6', grupoId: '14', matMedido: 24053.65, matAcumulado: 24053.65, nfAlocada: 487.13, nfJaAbatida: 0 },
      { detalhamentoId: '14.2.1', grupoId: '14', matMedido: 12574.48, matAcumulado: 12574.48, nfAlocada: 217162.55, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const item626 = resultado.get('14.2.6')!
    expect(item626.total).toBeCloseTo(24053.65, 2)
    expect(item626.total).toBeCloseTo(item626.direto + item626.transbordo, 2)

    const item621 = resultado.get('14.2.1')!
    expect(item621.total).toBeCloseTo(12574.48, 2)
  })
})

describe('grupos não se misturam', () => {
  it('NF ociosa do grupo 10 não cobre a falta do grupo 3', () => {
    const itens: ItemDesconto[] = [
      // Sobra ociosa grande no grupo 10 (não medido, NF parada).
      { detalhamentoId: 'g10-ocioso', grupoId: '10', matMedido: 0, matAcumulado: 0, nfAlocada: 5000, nfJaAbatida: 0 },
      // Falta no grupo 3 — não pode ser coberta pelo grupo 10.
      { detalhamentoId: 'g3-faltante', grupoId: '3', matMedido: 200, matAcumulado: 200, nfAlocada: 0, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const g3 = resultado.get('g3-faltante')!
    expect(g3.transbordo).toBe(0)
    expect(g3.total).toBeCloseTo(0, 2)
  })
})

describe('pool insuficiente — rateio proporcional', () => {
  it('rateia a sobra proporcionalmente quando o pool não cobre toda a falta', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'falta-100', grupoId: 'g', matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'falta-300', grupoId: 'g', matMedido: 300, matAcumulado: 300, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'sobra-200', grupoId: 'g', matMedido: 0, matAcumulado: 0, nfAlocada: 200, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const falta100 = resultado.get('falta-100')!
    const falta300 = resultado.get('falta-300')!

    expect(falta100.transbordo).toBeCloseTo(50, 2)
    expect(falta300.transbordo).toBeCloseTo(150, 2)

    // A soma distribuída nunca excede o pool disponível.
    const somaDistribuida = falta100.transbordo + falta300.transbordo
    expect(somaDistribuida).toBeLessThanOrEqual(200 + 1e-9)
    expect(somaDistribuida).toBeCloseTo(200, 2)
  })
})

describe('grupoId null não transborda', () => {
  it('item sem grupo não recebe transbordo mesmo havendo sobra em outros', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'sem-grupo-falta', grupoId: null, matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'com-grupo-sobra', grupoId: 'g1', matMedido: 0, matAcumulado: 0, nfAlocada: 500, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const semGrupo = resultado.get('sem-grupo-falta')!
    expect(semGrupo.transbordo).toBe(0)
    expect(semGrupo.total).toBeCloseTo(0, 2)
  })

  it('item sem grupo não doa sua sobra ociosa para outros detalhamentos', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'sem-grupo-sobra', grupoId: null, matMedido: 0, matAcumulado: 0, nfAlocada: 500, nfJaAbatida: 0 },
      { detalhamentoId: 'com-grupo-falta', grupoId: 'g1', matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const comGrupo = resultado.get('com-grupo-falta')!
    expect(comGrupo.transbordo).toBe(0)
    expect(comGrupo.total).toBeCloseTo(0, 2)
  })
})

describe('determinismo', () => {
  it('a ordem dos itens de entrada não muda o resultado', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: '14.2.6', grupoId: '14', matMedido: 24053.65, matAcumulado: 24053.65, nfAlocada: 487.13, nfJaAbatida: 0 },
      { detalhamentoId: '14.2.1', grupoId: '14', matMedido: 12574.48, matAcumulado: 12574.48, nfAlocada: 217162.55, nfJaAbatida: 0 },
      { detalhamentoId: 'falta-100', grupoId: 'g', matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'falta-300', grupoId: 'g', matMedido: 300, matAcumulado: 300, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'sobra-200', grupoId: 'g', matMedido: 0, matAcumulado: 0, nfAlocada: 200, nfJaAbatida: 0 },
      { detalhamentoId: 'g10-ocioso', grupoId: '10', matMedido: 0, matAcumulado: 0, nfAlocada: 5000, nfJaAbatida: 0 },
      { detalhamentoId: 'g3-faltante', grupoId: '3', matMedido: 200, matAcumulado: 200, nfAlocada: 0, nfJaAbatida: 0 },
      { detalhamentoId: 'sem-grupo-falta', grupoId: null, matMedido: 100, matAcumulado: 100, nfAlocada: 0, nfJaAbatida: 0 },
    ]

    const resultadoOriginal = calcularDescontoComTransbordo(itens)
    const resultadoEmbaralhado = calcularDescontoComTransbordo(embaralhar(itens))

    for (const item of itens) {
      const original = resultadoOriginal.get(item.detalhamentoId)!
      const embaralhadoResultado = resultadoEmbaralhado.get(item.detalhamentoId)!
      expect(embaralhadoResultado.direto).toBeCloseTo(original.direto, 2)
      expect(embaralhadoResultado.transbordo).toBeCloseTo(original.transbordo, 2)
      expect(embaralhadoResultado.total).toBeCloseTo(original.total, 2)
    }
  })
})

describe('nunca desconta mais que o material executado', () => {
  it('NF disponível gigante não faz o total ultrapassar o material acumulado', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'x', grupoId: 'g1', matMedido: 10, matAcumulado: 10, nfAlocada: 1_000_000, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const x = resultado.get('x')!
    expect(x.total).toBeCloseTo(10, 2)
    expect(x.total).toBeLessThanOrEqual(10)
  })
})

describe('entradas degeneradas', () => {
  it('array vazio retorna um Map vazio', () => {
    const resultado = calcularDescontoComTransbordo([])
    expect(resultado.size).toBe(0)
  })

  it('valores negativos ou NaN em matMedido/nfAlocada são tratados como zero', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'negativo', grupoId: 'g1', matMedido: -50, matAcumulado: -50, nfAlocada: NaN, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const item = resultado.get('negativo')!
    expect(item.direto).toBe(0)
    expect(item.transbordo).toBe(0)
    expect(item.total).toBe(0)
  })

  it('item com matMedido 0 e nfAlocada 0 fica zerado sem erro', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: 'zerado', grupoId: 'g1', matMedido: 0, matAcumulado: 0, nfAlocada: 0, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const item = resultado.get('zerado')!
    expect(item.direto).toBe(0)
    expect(item.transbordo).toBe(0)
    expect(item.total).toBe(0)
  })
})

describe('caso da Geração — pool não cobre tudo', () => {
  it('2.7.1 recebe o pool inteiro do grupo 2 e mantém gap residual', () => {
    const itens: ItemDesconto[] = [
      { detalhamentoId: '2.7.1', grupoId: '2', matMedido: 26611.16, matAcumulado: 26611.16, nfAlocada: 13511.04, nfJaAbatida: 0 },
      { detalhamentoId: '2-ocioso-1', grupoId: '2', matMedido: 0, matAcumulado: 0, nfAlocada: 9615.34, nfJaAbatida: 0 },
      { detalhamentoId: '2-ocioso-2', grupoId: '2', matMedido: 0, matAcumulado: 0, nfAlocada: 209.28, nfJaAbatida: 0 },
    ]

    const resultado = calcularDescontoComTransbordo(itens)

    const item = resultado.get('2.7.1')!
    expect(item.transbordo).toBeCloseTo(9824.62, 2)

    const gapResidual = 26611.16 - item.total
    expect(gapResidual).toBeCloseTo(3275.5, 2)
  })
})

describe('saldo corrido entre medições', () => {
  // Este é o caso que motivou apurar o saldo por grupo ANTES de clampar em
  // zero. O item que recebe transbordo grava em `nf_material_descontada` mais
  // do que a NF alocada a ele — o excesso veio do vizinho. Se cada item fosse
  // clampado isoladamente, esse excesso sumiria e a nota do vizinho seria
  // oferecida de novo no mês seguinte, descontando duas vezes.
  it('não reoferece a nota do vizinho na medição seguinte', () => {
    // Mês 1: A mede 24.053,65 com apenas 487,13 de NF própria; B tem
    // 217.162,55 parados e nada medido.
    const mes1 = calcularDescontoComTransbordo([
      { detalhamentoId: 'A', grupoId: '14', matMedido: 24053.65, matAcumulado: 24053.65, nfAlocada: 487.13, nfJaAbatida: 0 },
      { detalhamentoId: 'B', grupoId: '14', matMedido: 0, matAcumulado: 0, nfAlocada: 217162.55, nfJaAbatida: 0 },
    ])
    expect(mes1.get('A')!.total).toBeCloseTo(24053.65, 2)

    // O abatimento é gravado no item medido (regra da migration 074): A fica
    // com 24.053,65 abatidos contra 487,13 alocados.
    const abatidoA = mes1.get('A')!.total
    const abatidoB = mes1.get('B')!.total
    expect(abatidoB).toBeCloseTo(0, 2)

    // Mês 2: A mede mais 10.000. O saldo do grupo tem de descontar o que já
    // foi consumido no mês 1, mesmo estando gravado no item "errado".
    const mes2 = calcularDescontoComTransbordo([
      { detalhamentoId: 'A', grupoId: '14', matMedido: 10000, matAcumulado: 34053.65, nfAlocada: 487.13, nfJaAbatida: abatidoA },
      { detalhamentoId: 'B', grupoId: '14', matMedido: 0, matAcumulado: 0, nfAlocada: 217162.55, nfJaAbatida: abatidoB },
    ])

    // Disponível do grupo = (487,13 + 217.162,55) − 24.053,65 = 193.596,03.
    // Sobra de sobra, então os 10.000 são cobertos — mas o total consumido
    // nos dois meses não pode passar da NF do grupo.
    expect(mes2.get('A')!.total).toBeCloseTo(10000, 2)
    const consumido = abatidoA + mes2.get('A')!.total
    expect(consumido).toBeLessThanOrEqual(487.13 + 217162.55)
  })

  it('para de descontar quando a NF do grupo se esgota', () => {
    // Grupo com 1.000 de NF, dos quais 900 já foram abatidos num item cuja
    // alocação própria era só 100 — o excesso de 800 veio do vizinho.
    const r = calcularDescontoComTransbordo([
      { detalhamentoId: 'A', grupoId: '9', matMedido: 500, matAcumulado: 1400, nfAlocada: 100, nfJaAbatida: 900 },
      { detalhamentoId: 'B', grupoId: '9', matMedido: 0, matAcumulado: 0, nfAlocada: 900, nfJaAbatida: 0 },
    ])
    // Disponível do grupo = 1.000 − 900 = 100. Não os 900 de B.
    expect(r.get('A')!.total).toBeCloseTo(100, 2)
  })
})


describe('régua acumulada', () => {
  // O caso que motivou a mudança: nos meses 1 a 3 a nota existia mas ficou
  // parada no detalhamento errado sob a regra item-a-item, e o desconto do
  // período não a alcançava. Apurando sobre o acumulado ela volta sozinha.
  it('recupera nota que ficou para trás em medições anteriores', () => {
    // Grupo com 46.214,00 de material acumulado e 51.624,13 de NF lançada.
    // As medições anteriores só abateram 29.369,06 — faltaram 1.239,78.
    const r = calcularDescontoComTransbordo([
      {
        detalhamentoId: 'A', grupoId: '1',
        matMedido: 15605.16, matAcumulado: 46214.00,
        nfAlocada: 51624.13, nfJaAbatida: 29369.06,
      },
    ])

    const a = r.get('A')!
    // Desconto acumulado = min(46.214,00; 51.624,13) = 46.214,00
    // Do período = 46.214,00 − 29.369,06 = 16.844,94 (1.239,78 acima do mês).
    expect(a.total).toBeCloseTo(16844.94, 2)
    expect(a.recuperacao).toBeCloseTo(1239.78, 2)
  })

  it('a trava do acumulado impede descontar material ainda não executado', () => {
    // R$ 200 mil de tubo comprado, R$ 50 mil instalados no acumulado.
    const r = calcularDescontoComTransbordo([
      {
        detalhamentoId: 'A', grupoId: '10',
        matMedido: 20000, matAcumulado: 50000,
        nfAlocada: 200000, nfJaAbatida: 30000,
      },
    ])
    // min(50.000; 200.000) − 30.000 = 20.000. O resto fica de saldo.
    expect(r.get('A')!.total).toBeCloseTo(20000, 2)
    expect(r.get('A')!.recuperacao).toBeCloseTo(0, 2)
  })

  it('material executado além da nota lançada continua sem cobertura', () => {
    // Geração: 67.084,81 acumulados de material contra 58.237,50 de NF.
    const r = calcularDescontoComTransbordo([
      {
        detalhamentoId: '2.7.1', grupoId: '2',
        matMedido: 26611.16, matAcumulado: 67084.81,
        nfAlocada: 58237.50, nfJaAbatida: 38834.32,
      },
    ])
    const item = r.get('2.7.1')!
    expect(item.total).toBeCloseTo(19403.18, 2)
    // Gap do período — é aqui que a FIP realmente precisa emitir nota.
    expect(26611.16 - item.total).toBeCloseTo(7207.98, 2)
  })

  it('não desconta duas vezes ao longo de três medições seguidas', () => {
    const NF = 1000
    let abatido = 0
    let acumulado = 0
    for (const medido of [400, 400, 400]) {
      acumulado += medido
      const r = calcularDescontoComTransbordo([
        {
          detalhamentoId: 'A', grupoId: 'g',
          matMedido: medido, matAcumulado: acumulado,
          nfAlocada: NF, nfJaAbatida: abatido,
        },
      ])
      abatido += r.get('A')!.total
    }
    // 1.200 de material executado contra 1.000 de nota: desconta 1.000.
    expect(abatido).toBeCloseTo(1000, 2)
  })

  it('matAcumulado zerado por dado inconsistente não zera o desconto', () => {
    const r = calcularDescontoComTransbordo([
      { detalhamentoId: 'A', grupoId: 'g', matMedido: 500, matAcumulado: 0, nfAlocada: 900, nfJaAbatida: 0 },
    ])
    expect(r.get('A')!.total).toBeCloseTo(500, 2)
  })
})

describe('calcularSaldoAprovadoComTransbordo', () => {
  // Mesmo descasamento lote-x-pavimento: o pedido aprovado está num
  // detalhamento e a medição em outro, do mesmo grupo. Sem transbordo o
  // sistema pede "NF nova" para material já comprado.
  it('pedido aprovado do vizinho cobre o gap do item medido', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'medido', grupoId: '2', gapMaterial: 8000, aprovado: 0, nfAlocada: 0 },
      { detalhamentoId: 'pedido', grupoId: '2', gapMaterial: 0, aprovado: 300000, nfAlocada: 0 },
    ]
    expect(calcularSaldoAprovadoComTransbordo(itens).get('medido')).toBeCloseTo(8000, 2)
  })

  it('não classifica além do gap do próprio item', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'medido', grupoId: '2', gapMaterial: 100, aprovado: 999999, nfAlocada: 0 },
    ]
    expect(calcularSaldoAprovadoComTransbordo(itens).get('medido')).toBeCloseTo(100, 2)
  })

  it('pedido de outro grupo macro não cobre', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'medido', grupoId: '2', gapMaterial: 8000, aprovado: 0, nfAlocada: 0 },
      { detalhamentoId: 'pedido', grupoId: '10', gapMaterial: 0, aprovado: 300000, nfAlocada: 0 },
    ]
    expect(calcularSaldoAprovadoComTransbordo(itens).get('medido')).toBeCloseTo(0, 2)
  })

  it('pedido já totalmente faturado não sobra para classificar', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'medido', grupoId: '2', gapMaterial: 8000, aprovado: 50000, nfAlocada: 50000 },
    ]
    expect(calcularSaldoAprovadoComTransbordo(itens).get('medido')).toBeCloseTo(0, 2)
  })

  it('pool insuficiente é rateado proporcionalmente ao gap', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'a', grupoId: 'g', gapMaterial: 100, aprovado: 0, nfAlocada: 0 },
      { detalhamentoId: 'b', grupoId: 'g', gapMaterial: 300, aprovado: 200, nfAlocada: 0 },
    ]
    const r = calcularSaldoAprovadoComTransbordo(itens)
    expect(r.get('a')).toBeCloseTo(50, 2)
    expect(r.get('b')).toBeCloseTo(150, 2)
  })

  it('item sem grupo não recebe pedido de terceiros', () => {
    const itens: ItemSaldoAprovado[] = [
      { detalhamentoId: 'medido', grupoId: null, gapMaterial: 8000, aprovado: 0, nfAlocada: 0 },
      { detalhamentoId: 'pedido', grupoId: null, gapMaterial: 0, aprovado: 300000, nfAlocada: 0 },
    ]
    expect(calcularSaldoAprovadoComTransbordo(itens).get('medido')).toBeCloseTo(0, 2)
  })
})
