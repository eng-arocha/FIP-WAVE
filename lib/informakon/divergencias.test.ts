import { describe, expect, it } from 'vitest'
import { compararNotas, gerarCsvDivergencias, type LinhaDivergencia } from './divergencias'

// Fixture com dados reais do relatório de 28/07/2026 (ver conversa com o
// usuário) — serve tanto de regressão quanto de exemplo legível.
const INFORMAKON_FIXTURE = [
  {
    numero_nf: '232900',
    tipo_doc: 'NF-e',
    fornecedor_nome: 'M. A. Frota',
    grupo_codigo: '5',
    detalhamento_codigo: null,
    valor_descontado: 35084.13,
    valor_a_descontar: 0,
  },
  {
    numero_nf: '105242',
    tipo_doc: 'NF-e',
    fornecedor_nome: 'Pl Industria',
    grupo_codigo: '7',
    detalhamento_codigo: null,
    valor_descontado: 31196.17,
    valor_a_descontar: 0,
  },
  {
    numero_nf: '3040',
    tipo_doc: 'NF-e',
    fornecedor_nome: 'Fort Seal',
    grupo_codigo: '2',
    detalhamento_codigo: null,
    valor_descontado: 13443.75,
    valor_a_descontar: 0,
  },
]

const SISTEMA_FIXTURE = [
  { numero_nf: '3040', emitente: 'Fort Seal Ltda', valor: 13433.75 },
]

describe('compararNotas', () => {
  it('lista nota que só existe no Informakon', () => {
    const linhas = compararNotas(INFORMAKON_FIXTURE, SISTEMA_FIXTURE)
    const nf232900 = linhas.find(l => l.numero_nf === '232900')
    expect(nf232900).toBeDefined()
    expect(nf232900!.situacao).toBe('so_informakon')
    expect(nf232900!.valor_informakon).toBeCloseTo(35084.13)
    expect(nf232900!.valor_sistema).toBe(0)
    expect(nf232900!.diferenca).toBeCloseTo(35084.13)
    expect(nf232900!.fornecedor_informakon).toBe('M. A. Frota')
    expect(nf232900!.emitente_sistema).toBeNull()
  })

  it('lista nota que só existe no sistema', () => {
    const linhas = compararNotas(
      INFORMAKON_FIXTURE,
      [...SISTEMA_FIXTURE, { numero_nf: '999999', emitente: 'Fornecedor X', valor: 500 }],
    )
    const nf999999 = linhas.find(l => l.numero_nf === '999999')
    expect(nf999999).toBeDefined()
    expect(nf999999!.situacao).toBe('so_sistema')
    expect(nf999999!.valor_informakon).toBe(0)
    expect(nf999999!.valor_sistema).toBe(500)
    expect(nf999999!.diferenca).toBeCloseTo(-500)
    expect(nf999999!.fornecedor_informakon).toBeNull()
    expect(nf999999!.grupos).toBeNull()
    expect(nf999999!.emitente_sistema).toBe('Fornecedor X')
  })

  it('lista valor divergente acima da tolerância (NF 3040: 13443.75 x 13433.75)', () => {
    const linhas = compararNotas(INFORMAKON_FIXTURE, SISTEMA_FIXTURE)
    const nf3040 = linhas.find(l => l.numero_nf === '3040')
    expect(nf3040).toBeDefined()
    expect(nf3040!.situacao).toBe('valor_divergente')
    expect(nf3040!.valor_informakon).toBeCloseTo(13443.75)
    expect(nf3040!.valor_sistema).toBeCloseTo(13433.75)
    expect(nf3040!.diferenca).toBeCloseTo(10)
  })

  it('NÃO lista diferença dentro da tolerância', () => {
    const informakon = [
      { numero_nf: '111', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor Y', grupo_codigo: '1', valor_descontado: 100, valor_a_descontar: 0 },
    ]
    // Diferença de 3 centavos, tolerância default é 5 centavos.
    const sistema = [{ numero_nf: '111', emitente: 'Fornecedor Y', valor: 100.03 }]
    const linhas = compararNotas(informakon, sistema)
    expect(linhas.find(l => l.numero_nf === '111')).toBeUndefined()
  })

  it('respeita tolerância customizada', () => {
    const informakon = [
      { numero_nf: '222', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor Z', grupo_codigo: '1', valor_descontado: 100, valor_a_descontar: 0 },
    ]
    const sistema = [{ numero_nf: '222', emitente: 'Fornecedor Z', valor: 100.5 }]
    // Com tolerância maior que a diferença (0,50), não deve aparecer.
    expect(compararNotas(informakon, sistema, 1).find(l => l.numero_nf === '222')).toBeUndefined()
    // Com tolerância menor, deve aparecer.
    expect(compararNotas(informakon, sistema, 0.1).find(l => l.numero_nf === '222')).toBeDefined()
  })

  it('soma a mesma nota espalhada em vários macro itens, dos dois lados', () => {
    const informakon = [
      { numero_nf: '450', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor W', grupo_codigo: '3', detalhamento_codigo: null, valor_descontado: 1000, valor_a_descontar: 0 },
      { numero_nf: '450', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor W', grupo_codigo: '4', detalhamento_codigo: null, valor_descontado: 500, valor_a_descontar: 200 },
      { numero_nf: '450', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor W', grupo_codigo: null, detalhamento_codigo: '19.1.1', valor_descontado: 0, valor_a_descontar: 300 },
    ]
    const sistema = [
      { numero_nf: '450', emitente: 'Fornecedor W', valor: 1200 },
      { numero_nf: '450', emitente: 'Fornecedor W', valor: 800 },
    ]
    // informakon: 1000 + 700 + 300 = 2000 ; sistema: 1200 + 800 = 2000 -> soma bate, sem divergência.
    // Confirma que a soma de fato agregou as 3 linhas do Informakon e as 2 do
    // sistema (se não somasse tudo, qualquer combinação parcial já daria
    // divergência e o teste abaixo, com sistema alterado, não bateria certo).
    expect(compararNotas(informakon, sistema).find(l => l.numero_nf === '450')).toBeUndefined()

    const sistemaComDiferenca = [
      { numero_nf: '450', emitente: 'Fornecedor W', valor: 1200 },
      { numero_nf: '450', emitente: 'Fornecedor W', valor: 700 }, // total sistema = 1900, não 2000
    ]
    const nf450 = compararNotas(informakon, sistemaComDiferenca).find(l => l.numero_nf === '450')
    expect(nf450).toBeDefined()
    expect(nf450!.valor_informakon).toBeCloseTo(2000)
    expect(nf450!.valor_sistema).toBeCloseTo(1900)
    expect(nf450!.diferenca).toBeCloseTo(100)
  })

  it('agrega grupos distintos ordenados quando a nota está divergente', () => {
    const informakon = [
      { numero_nf: '600', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor V', grupo_codigo: '9', detalhamento_codigo: null, valor_descontado: 100, valor_a_descontar: 0 },
      { numero_nf: '600', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor V', grupo_codigo: null, detalhamento_codigo: '19.1.2', valor_descontado: 50, valor_a_descontar: 0 },
      { numero_nf: '600', tipo_doc: 'NF-e', fornecedor_nome: 'Fornecedor V', grupo_codigo: '2', detalhamento_codigo: null, valor_descontado: 25, valor_a_descontar: 0 },
    ]
    const linhas = compararNotas(informakon, [])
    const nf600 = linhas.find(l => l.numero_nf === '600')
    expect(nf600!.grupos).toBe('19.1.2, 2, 9')
  })

  it('ignora números de nota vazios ou nulos dos dois lados', () => {
    const informakon = [
      { numero_nf: null, tipo_doc: 'NF-e', fornecedor_nome: 'X', grupo_codigo: '1', valor_descontado: 999, valor_a_descontar: 0 },
      { numero_nf: '', tipo_doc: 'NF-e', fornecedor_nome: 'X', grupo_codigo: '1', valor_descontado: 999, valor_a_descontar: 0 },
    ]
    const sistema = [{ numero_nf: '', emitente: 'X', valor: 999 }]
    expect(compararNotas(informakon, sistema)).toEqual([])
  })

  it('ordena por diferença absoluta decrescente', () => {
    const linhas = compararNotas(INFORMAKON_FIXTURE, SISTEMA_FIXTURE)
    // 232900 (35084.13) > 105242 (31196.17) > 3040 (10)
    expect(linhas.map(l => l.numero_nf)).toEqual(['232900', '105242', '3040'])
  })
})

describe('gerarCsvDivergencias', () => {
  const linhas: LinhaDivergencia[] = [
    {
      numero_nf: '232900',
      tipo_doc: 'NF-e',
      fornecedor_informakon: 'M. A. Frota',
      emitente_sistema: null,
      grupos: '5',
      valor_informakon: 35084.13,
      valor_sistema: 0,
      diferenca: 35084.13,
      situacao: 'so_informakon',
    },
  ]

  it('começa com o BOM', () => {
    const csv = gerarCsvDivergencias(linhas)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  it('usa ; como separador e cabeçalho em português', () => {
    const csv = gerarCsvDivergencias(linhas)
    const [cabecalho] = csv.replace(/^﻿/, '').split('\r\n')
    expect(cabecalho).toBe(
      'Número NF;Tipo Documento;Fornecedor (Informakon);Emitente (Sistema);Grupos;Valor Informakon;Valor Sistema;Diferença;Situação',
    )
  })

  it('escapa campo que contém ; entre aspas', () => {
    const comPontoEVirgula: LinhaDivergencia[] = [
      {
        ...linhas[0],
        fornecedor_informakon: 'Fornecedor A; Fornecedor B',
      },
    ]
    const csv = gerarCsvDivergencias(comPontoEVirgula)
    expect(csv).toContain('"Fornecedor A; Fornecedor B"')
  })

  it('escapa aspas internas dobrando-as', () => {
    const comAspas: LinhaDivergencia[] = [
      {
        ...linhas[0],
        fornecedor_informakon: 'Fornecedor "Apelido"',
      },
    ]
    const csv = gerarCsvDivergencias(comAspas)
    expect(csv).toContain('"Fornecedor ""Apelido"""')
  })

  it('formata números em padrão brasileiro (vírgula decimal, sem milhar)', () => {
    const csv = gerarCsvDivergencias(linhas)
    expect(csv).toContain('35084,13')
    expect(csv).not.toContain('35,084.13')
    expect(csv).not.toContain('35.084,13')
  })
})
