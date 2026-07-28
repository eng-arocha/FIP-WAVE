import { describe, it, expect } from 'vitest'
import { conciliarMedicaoComInformakon } from './medicao-conciliacao-informakon'

/**
 * Mock mínimo de SupabaseClient: cada `.from(tabela)` devolve um builder
 * encadeável (.select/.eq/.order/.limit/.single) "thenable" que resolve pro
 * resultado pré-configurado da tabela em `tableResults`. Mesmo padrão de
 * `lib/db/fat-direto-3way.test.ts`.
 */
function makeAdmin(tableResults: Record<string, { data: any; error: any }>) {
  function makeBuilder(table: string) {
    const result = tableResults[table] ?? { data: null, error: null }
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(result),
      then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
    }
    return builder
  }
  return { from: (table: string) => makeBuilder(table) } as any
}

const CONTRATO_ID = 'contrato-1'
const MEDICAO_ID = 'medicao-1'
const MEDICAO_NUMERO = 4

// Um item de medição: 10 unidades, material R$ 50/un, serviço R$ 100/un
// → material medido 500, serviço medido 1000, contratual 1500.
const MEDICAO_ITENS_BASE = [
  { quantidade_medida: 10, detalhamento: { valor_material_unit: 50, valor_servico_unit: 100 } },
]

function baseTableResults(overrides: Record<string, { data: any; error: any }> = {}) {
  return {
    medicoes: { data: { numero: MEDICAO_NUMERO, ajuste_material_anterior: 0 }, error: null },
    contratos: { data: { percentual_retencao: 5 }, error: null },
    medicao_itens: { data: MEDICAO_ITENS_BASE, error: null },
    informakon_importacoes: {
      data: [{ id: 'imp-1', referencia: '2026-07-01' }],
      error: null,
    },
    informakon_medicoes_servico: { data: [], error: null },
    ...overrides,
  }
}

describe('conciliarMedicaoComInformakon', () => {
  it('sem importação do Informakon → temDados false', async () => {
    const admin = makeAdmin(
      baseTableResults({
        informakon_importacoes: { data: [], error: null },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.temDados).toBe(false)
    expect(r.informakon).toBeNull()
    expect(r.referencia).toBeNull()
    expect(r.divergencias).toEqual([])
  })

  it('há importação mas sem linha pra esta medição → temDados false', async () => {
    const admin = makeAdmin(baseTableResults()) // informakon_medicoes_servico vazio
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.temDados).toBe(false)
    expect(r.informakon).toBeNull()
  })

  it('valores idênticos → divergencias vazia', async () => {
    // Sistema: contratual 1500, material 500, retenção 5% = 75, aPagar = 1000 - 75 - 0 = 925
    const admin = makeAdmin(
      baseTableResults({
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 500, retencao: 75, valor_a_pagar: 925 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.temDados).toBe(true)
    expect(r.referencia).toBe('2026-07-01')
    expect(r.divergencias).toEqual([])
    expect(r.maiorDivergencia).toBe(0)
    expect(r.sistema).toEqual({ contratual: 1500, material: 500, retencao: 75, aPagar: 925 })
  })

  it('divergência em material → uma linha com a diferença certa', async () => {
    // Informakon descontou R$ 600 de material (sistema calculou 500) —
    // demais campos batem com o sistema pra isolar só essa divergência.
    const admin = makeAdmin(
      baseTableResults({
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 600, retencao: 75, valor_a_pagar: 925 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.temDados).toBe(true)
    expect(r.divergencias).toHaveLength(1)
    expect(r.divergencias[0]).toMatchObject({
      campo: 'material',
      rotulo: 'Material descontado',
      informakon: 600,
      sistema: 500,
      diferenca: 100,
    })
    expect(r.maiorDivergencia).toBe(100)
  })

  it('caso real: divergência de R$ 11.541,44 aparece em valor a pagar', async () => {
    const admin = makeAdmin(
      baseTableResults({
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 500, retencao: 75, valor_a_pagar: 925 + 11541.44 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    const divApagar = r.divergencias.find(d => d.campo === 'aPagar')
    expect(divApagar).toBeDefined()
    expect(divApagar!.diferenca).toBeCloseTo(11541.44, 2)
    expect(r.maiorDivergencia).toBeCloseTo(11541.44, 2)
  })

  it('tabela informakon_importacoes ausente (erro de schema) → temDados false sem lançar', async () => {
    const admin = makeAdmin(
      baseTableResults({
        informakon_importacoes: {
          data: null,
          error: { code: 'PGRST205', message: "Could not find the table 'public.informakon_importacoes' in the schema cache" },
        },
      }),
    )
    await expect(conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)).resolves.toMatchObject({
      temDados: false,
      informakon: null,
    })
  })

  it('coluna ajuste_material_anterior ausente (migration 074 pendente) → trata como 0, não quebra', async () => {
    const admin = makeAdmin(
      baseTableResults({
        medicoes: {
          data: null,
          error: { code: 'PGRST204', message: "Could not find the column 'ajuste_material_anterior' of 'medicoes' in the schema cache" },
        },
      }),
    )
    // O builder de 'medicoes' é o mesmo pro fallback (.select('numero')) —
    // como o mock não distingue por select, ele resolveria de novo o erro.
    // Simulamos o fallback já corrigindo o resultado após a 1ª leitura.
    let call = 0
    const original = admin.from.bind(admin)
    admin.from = (table: string) => {
      if (table !== 'medicoes') return original(table)
      call += 1
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        single: () =>
          call === 1
            ? Promise.resolve({
                data: null,
                error: { code: 'PGRST204', message: "Could not find the column 'ajuste_material_anterior' of 'medicoes' in the schema cache" },
              })
            : Promise.resolve({ data: { numero: MEDICAO_NUMERO }, error: null }),
      }
      return builder
    }

    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    // Segue calculando normalmente (ajuste tratado como 0) em vez de quebrar.
    expect(r.temDados).toBe(false) // sem importação configurada neste teste específico
    expect(r.sistema.aPagar).toBe(1000 - 75) // serviço − retenção − 0 (ajuste tratado como 0)
  })

  it('erro inesperado em qualquer consulta → devolve temDados false em vez de lançar', async () => {
    const admin = makeAdmin(
      baseTableResults({
        medicao_itens: { data: null, error: new Error('conexão perdida') },
      }),
    )
    await expect(conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)).resolves.toBeDefined()
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.sistema).toEqual({ contratual: 0, material: 0, retencao: 0, aPagar: 0 })
  })

  // Medição APROVADA: o boletim tem de usar o snapshot congelado na
  // aprovação, não recalcular a partir do preço unitário de hoje. Esta é a
  // tela cujo propósito é detectar divergência contra o ERP da FIP — se ela
  // recalculasse ao vivo, editar um valor_material_unit meses depois
  // inventaria uma divergência que não existe.
  it('medição aprovada usa o snapshot congelado, não o preço unitário de hoje', async () => {
    const admin = makeAdmin(
      baseTableResults({
        medicoes: {
          data: {
            numero: MEDICAO_NUMERO,
            status: 'aprovado',
            valor_total: 1500,
            valor_material_correspondente: 500,
            ajuste_material_anterior: 0,
          },
          error: null,
        },
        // Preço unitário foi editado depois da aprovação: agora daria
        // material 900 / serviço 1000. O snapshot tem de prevalecer.
        medicao_itens: {
          data: [{ quantidade_medida: 10, detalhamento: { valor_material_unit: 90, valor_servico_unit: 100 } }],
          error: null,
        },
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 500, retencao: 75, valor_a_pagar: 925 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.sistema).toEqual({ contratual: 1500, material: 500, retencao: 75, aPagar: 925 })
    expect(r.divergencias).toEqual([])
  })

  // MED-001/MED-002 do WAVE: aprovadas antes de a coluna existir, ficaram com
  // 0 gravado (não null). O guard tem de ser `> 0`, senão o snapshot "vazio"
  // zera a conciliação inteira — foi assim que a MED-003 apareceu zerada.
  it('aprovada sem snapshot (coluna gravada como 0) volta ao cálculo ao vivo', async () => {
    const admin = makeAdmin(
      baseTableResults({
        medicoes: {
          data: {
            numero: MEDICAO_NUMERO,
            status: 'aprovado',
            valor_total: 1200,
            valor_material_correspondente: 0,
            ajuste_material_anterior: 0,
          },
          error: null,
        },
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 500, retencao: 75, valor_a_pagar: 925 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    // Cálculo ao vivo dos itens base: material 500, serviço 1000.
    expect(r.sistema.material).toBe(500)
    expect(r.sistema.contratual).toBe(1500)
    expect(r.divergencias).toEqual([])
  })

  it('medição não aprovada recalcula ao vivo mesmo tendo valores gravados', async () => {
    const admin = makeAdmin(
      baseTableResults({
        medicoes: {
          data: {
            numero: MEDICAO_NUMERO,
            status: 'submetido',
            valor_total: 9999,
            valor_material_correspondente: 9999,
            ajuste_material_anterior: 0,
          },
          error: null,
        },
        informakon_medicoes_servico: {
          data: [{ valor_contratual: 1500, valor_material: 500, retencao: 75, valor_a_pagar: 925 }],
          error: null,
        },
      }),
    )
    const r = await conciliarMedicaoComInformakon(admin, CONTRATO_ID, MEDICAO_ID)
    expect(r.sistema).toEqual({ contratual: 1500, material: 500, retencao: 75, aPagar: 925 })
  })
})
