import { describe, it, expect } from 'vitest'
import { parseSaldoColado, valorPtBr } from './saldo-colado'

const CAB = 'Documento\tInsumo\tEspecificação\tUnidade\tQtd.a Desc\tVlr. a Desc\tQtd.Desc\tVlr.Desc'

/** Recorte fiel da grade do ERP (26/08/2026, depois da medição 04). */
const DETALHADO = [
  CAB,
  'NF-e 198\t71635\tFaturamento direto  - ELÉTRICA SUBESTAÇÃO\tR$\t0,0000\t0,00\t5.261,8400\t5.261,84',
  'NF-e 534\t71635\tFaturamento direto  - ELÉTRICA SUBESTAÇÃO\tR$\t72.780,8100\t72.780,81\t0,0000\t0,00',
  'NF-e 232900\t71635\tFaturamento direto  - ESGOTO\tR$\t2.384,9800\t2.384,98\t32.699,1500\t32.699,15',
  'NF-e 213366\t71635\tFaturamento direto  - FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS\tR$\t58,2300\t58,23\t0,0000\t0,00',
  '\t\t\t\t\t75.224,02\t37.961,00\t37.960,99',
].join('\n')

const AGREGADO = [
  'Rótulos de Linha\tSoma de Vlr. a Desc',
  'Faturamento direto  - ÁGUA PLUVIAL\t375.254,16',
  'Faturamento direto  - ESGOTO\t413.942,67',
  'Total Geral\t789.196,83',
].join('\n')

describe('valorPtBr', () => {
  it('lê o formato do ERP', () => {
    expect(valorPtBr('515.299,66')).toBe(515299.66)
    expect(valorPtBr('R$ 1.234,00')).toBe(1234)
    expect(valorPtBr('(1.234,00)')).toBe(-1234)
    expect(valorPtBr('R$')).toBeNull()
    expect(valorPtBr('')).toBeNull()
  })
})

describe('parseSaldoColado — layout detalhado', () => {
  const lido = parseSaldoColado(DETALHADO)

  it('reconhece o formato e uma linha por nota', () => {
    expect(lido.formato).toBe('detalhado')
    expect(lido.notas).toHaveLength(4)
  })

  it('separa o número da nota para casar com o nosso lado', () => {
    const n534 = lido.notas.find(n => n.numeroNf === '534')!
    expect(n534.tipoDoc).toBe('NF-e')
    expect(n534.documento).toBe('NF-e 534')
    expect(n534.grupoCodigo).toBe('1')
    expect(n534.valorADescontar).toBe(72780.81)
    expect(n534.valorDescontado).toBe(0)
  })

  it('não confunde Vlr. a Desc com Vlr.Desc', () => {
    const n198 = lido.notas.find(n => n.numeroNf === '198')!
    expect(n198.valorADescontar).toBe(0)
    expect(n198.valorDescontado).toBe(5261.84)
  })

  it('a nota que está nos dois lados traz os dois valores', () => {
    const n = lido.notas.find(n => n.numeroNf === '232900')!
    expect(n.valorADescontar).toBe(2384.98)
    expect(n.valorDescontado).toBe(32699.15)
  })

  it('agrega por macro item — é o que a comparação consome', () => {
    const g1 = lido.linhas.find(l => l.grupoCodigo === '1')!
    expect(g1.valor).toBe(72780.81)
    expect(g1.valorDescontado).toBe(5261.84)
    expect(lido.total).toBe(75224.02)
    expect(lido.totalDescontado).toBe(37960.99)
  })

  it('lê a linha de totais sem tratá-la como nota', () => {
    expect(lido.totalInformado).toBe(75224.02)
    expect(lido.totalDescontadoInformado).toBe(37960.99)
    expect(lido.notas.every(n => n.documento !== '')).toBe(true)
  })

  it('resolve o grupo 19 pelo detalhamento, não pelo grupo', () => {
    const shaft = lido.notas.find(n => n.numeroNf === '213366')!
    expect(shaft.detalhamentoCodigo).toBe('19.1.2')
    expect(shaft.grupoCodigo).toBeNull()
  })

  it('funciona sem o cabeçalho colado', () => {
    const semCab = parseSaldoColado(DETALHADO.split('\n').slice(1).join('\n'))
    expect(semCab.formato).toBe('detalhado')
    expect(semCab.notas).toHaveLength(4)
    expect(semCab.notas.find(n => n.numeroNf === '198')!.valorDescontado).toBe(5261.84)
  })

  it('macro item desconhecido vira aviso, não erro', () => {
    const lido = parseSaldoColado([
      CAB,
      'NF-e 1\t71635\tFaturamento direto  - MACRO ITEM QUE NÃO EXISTE\tR$\t0,0000\t10,00\t0,0000\t0,00',
    ].join('\n'))
    expect(lido.notas).toHaveLength(1)
    expect(lido.naoReconhecidas.map(l => l.chave)).toEqual(['MACRO ITEM QUE NAO EXISTE'])
  })
})

describe('parseSaldoColado — layout agregado (compatibilidade)', () => {
  const lido = parseSaldoColado(AGREGADO)

  it('continua lendo a tabela dinâmica somada à mão', () => {
    expect(lido.formato).toBe('agregado')
    expect(lido.notas).toHaveLength(0)
    expect(lido.linhas).toHaveLength(2)
    expect(lido.total).toBe(789196.83)
    expect(lido.totalInformado).toBe(789196.83)
    expect(lido.linhas.every(l => l.valorDescontado === 0)).toBe(true)
  })

  it('não inventa formato detalhado a partir de duas colunas', () => {
    expect(parseSaldoColado('Faturamento direto  - ESGOTO\t413.942,67').formato).toBe('agregado')
  })
})
