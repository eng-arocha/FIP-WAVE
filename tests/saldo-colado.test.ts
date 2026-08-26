import { describe, it, expect } from 'vitest'
import { parseSaldoColado, valorPtBr } from '@/lib/informakon/saldo-colado'

/** A colagem real do usuário, tal como sai da tabela dinâmica. */
const COLAGEM = `Rótulos de Linha\tSoma de Vlr. a Desc
Faturamento direto  -  ALIMENTAÇÃO ELÉTRICA\t515.299,66
Faturamento direto  -  GERAÇÃO\t497,27
Faturamento direto  -  PISCINA E SPA\t23.643,60
Faturamento direto  - ADMINISTRAÇÃO OBRA\t44.384,90
Faturamento direto  - ÁGUA PLUVIAL\t375.254,16
Faturamento direto  - COMBATE AO INCÊNDIO\t481.745,48
Faturamento direto  - DISTRIBUIÇÃO ELÉTRICA\t45.027,42
Faturamento direto  - ELÉTRICA SUBESTAÇÃO\t72.780,81
Faturamento direto  - ESGOTO\t413.942,67
Faturamento direto  - FECHAMENTOS PASSAGENS VERTICAIS EM SHAFTS\t220.000,00
Faturamento direto  - GÁS\t49.179,33
Faturamento direto  - HIDRÁULICA\t627.572,33
Faturamento direto  - LÓGICA (DADOS E VOZ) - INFRA SECA\t51.691,18
Faturamento direto  - LOUÇAS E METAIS\t10.805,65
Faturamento direto  - QUADROS ELÉTRICOS\t314.667,77
Faturamento direto  - SISTEMA DE DETECÇÃO E ALARME DE INCÊNDIO (SDAI)\t77.355,49
Faturamento direto  - SISTEMA DE PROTEÇÃO CONTRA DESCARGA ATMOSFÉRICA\t3.265,48
Total Geral\t3.327.113,20`

describe('valorPtBr', () => {
  it('lê o formato do ERP (ponto = milhar, vírgula = decimal)', () => {
    expect(valorPtBr('515.299,66')).toBeCloseTo(515299.66, 2)
    expect(valorPtBr('497,27')).toBeCloseTo(497.27, 2)
    expect(valorPtBr('220.000,00')).toBeCloseTo(220000, 2)
  })

  it('aceita número sem vírgula e com R$', () => {
    expect(valorPtBr('1234')).toBe(1234)
    expect(valorPtBr('R$ 1.234,50')).toBeCloseTo(1234.5, 2)
  })

  it('parêntese é negativo (convenção contábil)', () => {
    expect(valorPtBr('(1.234,00)')).toBeCloseTo(-1234, 2)
  })

  it('devolve null para texto sem número', () => {
    expect(valorPtBr('Total Geral')).toBeNull()
    expect(valorPtBr('')).toBeNull()
  })
})

describe('parseSaldoColado — colagem real do usuário', () => {
  const r = parseSaldoColado(COLAGEM)

  it('lê as 17 linhas de macro item, sem o cabeçalho nem o total', () => {
    expect(r.linhas).toHaveLength(17)
  })

  it('a soma bate com o Total Geral informado', () => {
    expect(r.totalInformado).toBeCloseTo(3327113.2, 2)
    expect(r.total).toBeCloseTo(3327113.2, 2)
  })

  it('reconhece TODOS os macro itens — nenhum de-para faltando', () => {
    expect(r.naoReconhecidas).toHaveLength(0)
    expect(r.ignoradas).toHaveLength(0)
  })

  it('resolve o grupo macro certo', () => {
    const porGrupo = new Map(r.linhas.map(l => [l.grupoCodigo, l.valor]))
    expect(porGrupo.get('3')).toBeCloseTo(515299.66, 2)   // ALIMENTAÇÃO ELÉTRICA
    expect(porGrupo.get('8')).toBeCloseTo(375254.16, 2)   // ÁGUA PLUVIAL
    expect(porGrupo.get('18')).toBeCloseTo(3265.48, 2)    // SPDA
  })

  it('o grupo 19 vem por detalhamento, não por grupo', () => {
    const adm = r.linhas.find(l => l.macroItem.includes('ADMINISTRAÇÃO OBRA'))!
    expect(adm.detalhamentoCodigo).toBe('19.1.1')
    expect(adm.grupoCodigo).toBeNull()

    // 19.1.2 — o Informakon ainda usa o nome antigo do item, renomeado na
    // migration 078. O alias no parser é o que mantém isto funcionando.
    const fech = r.linhas.find(l => l.macroItem.includes('FECHAMENTOS'))!
    expect(fech.detalhamentoCodigo).toBe('19.1.2')
    expect(fech.valor).toBeCloseTo(220000, 2)
  })
})

describe('parseSaldoColado — formatos e sujeira', () => {
  it('aceita colagem separada por espaços em vez de TAB', () => {
    const r = parseSaldoColado('Faturamento direto  - ESGOTO     413.942,67')
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].grupoCodigo).toBe('9')
    expect(r.linhas[0].valor).toBeCloseTo(413942.67, 2)
  })

  it('macro item desconhecido vira aviso, não erro', () => {
    const r = parseSaldoColado('Faturamento direto - COISA QUE NAO EXISTE\t1.000,00')
    expect(r.linhas).toHaveLength(1)
    expect(r.naoReconhecidas).toHaveLength(1)
    expect(r.total).toBeCloseTo(1000, 2)
  })

  it('linha sem valor numérico é ignorada e reportada', () => {
    const r = parseSaldoColado('isto aqui não é uma linha de dados')
    expect(r.linhas).toHaveLength(0)
    expect(r.ignoradas).toHaveLength(1)
  })

  it('texto vazio não quebra', () => {
    const r = parseSaldoColado('')
    expect(r.linhas).toHaveLength(0)
    expect(r.total).toBe(0)
    expect(r.totalInformado).toBeNull()
  })

  it('detecta colagem incompleta: soma diferente do Total Geral', () => {
    const r = parseSaldoColado('Faturamento direto - ESGOTO\t100,00\nTotal Geral\t999,00')
    expect(r.total).toBeCloseTo(100, 2)
    expect(r.totalInformado).toBeCloseTo(999, 2)
    expect(Math.abs(r.total - r.totalInformado!)).toBeGreaterThan(0.01)
  })
})
