import { describe, it, expect } from 'vitest'
import { chaveMacroItem, compararSaldoInformakon } from '@/lib/informakon/comparar-saldo'

describe('chaveMacroItem', () => {
  it('grupos 1..18 comparam no macro grupo', () => {
    expect(chaveMacroItem('18.1.6')).toBe('18')
    expect(chaveMacroItem('3.1.11')).toBe('3')
    expect(chaveMacroItem('14.2.13')).toBe('14')
  })

  it('o grupo 19 compara por detalhamento — é assim que o Informakon consolida', () => {
    expect(chaveMacroItem('19.1.1')).toBe('19.1.1')
    expect(chaveMacroItem('19.1.2')).toBe('19.1.2')
  })

  it('código vazio não vira chave', () => {
    expect(chaveMacroItem('')).toBe('')
    expect(chaveMacroItem(null)).toBe('')
  })
})

describe('compararSaldoInformakon', () => {
  const saldo = [
    { chave: '18', rotulo: 'SPDA', valor: 3265.48 },
    { chave: '9', rotulo: 'ESGOTO', valor: 413942.67 },
    { chave: '19.1.2', rotulo: 'FECHAMENTOS…', valor: 220000 },
  ]

  it('acusa quando o boletim pede mais desconto do que existe lançado', () => {
    // Grupo 18: o boletim manda descontar 10.000, o ERP só tem 3.265,48.
    const r = compararSaldoInformakon(
      [
        { codigo: '18.1.6', nf_descontavel: 8000 },
        { codigo: '18.1.14', nf_descontavel: 2000 },
      ],
      saldo,
    )
    const g18 = r.linhas.find(l => l.chave === '18')!
    expect(g18.boletim).toBeCloseTo(10000, 2)
    expect(g18.informakon).toBeCloseTo(3265.48, 2)
    expect(g18.diferenca).toBeCloseTo(6734.52, 2)
    expect(g18.falta).toBe(true)
    expect(r.totalFaltante).toBeCloseTo(6734.52, 2)
  })

  it('não acusa quando o lançado cobre o pedido', () => {
    const r = compararSaldoInformakon(
      [{ codigo: '9.1.1', nf_descontavel: 100000 }],
      saldo,
    )
    expect(r.faltantes).toHaveLength(0)
    expect(r.totalFaltante).toBe(0)
  })

  it('soma as linhas do mesmo macro grupo antes de comparar', () => {
    const r = compararSaldoInformakon(
      [
        { codigo: '9.1.1', nf_descontavel: 200000 },
        { codigo: '9.1.8', nf_descontavel: 200000 },
        { codigo: '9.1.13', nf_descontavel: 100000 },
      ],
      saldo,
    )
    const g9 = r.linhas.find(l => l.chave === '9')!
    expect(g9.boletim).toBeCloseTo(500000, 2)
    expect(g9.falta).toBe(true)   // 500.000 > 413.942,67
  })

  it('o grupo 19 é comparado por detalhamento, não somado no grupo', () => {
    const r = compararSaldoInformakon(
      [
        { codigo: '19.1.1', nf_descontavel: 50000 },   // sem retrato
        { codigo: '19.1.2', nf_descontavel: 100000 },  // tem 220.000
      ],
      saldo,
    )
    expect(r.linhas.find(l => l.chave === '19.1.2')!.falta).toBe(false)
    expect(r.linhas.find(l => l.chave === '19.1.1')!.informakon).toBeNull()
  })

  it('macro item sem retrato é sinalizado, não tratado como falta', () => {
    const r = compararSaldoInformakon(
      [{ codigo: '7.1.5', nf_descontavel: 5000 }],
      saldo,
    )
    const g7 = r.linhas.find(l => l.chave === '7')!
    expect(g7.informakon).toBeNull()
    expect(g7.falta).toBe(false)
    expect(r.semRetrato).toHaveLength(1)
  })

  it('macro item do retrato sem desconto nesta medição não polui o painel', () => {
    const r = compararSaldoInformakon(
      [{ codigo: '18.1.6', nf_descontavel: 100 }],
      saldo,
    )
    expect(r.linhas.map(l => l.chave)).toEqual(['18'])
  })

  it('diferença de centavos não vira alerta', () => {
    const r = compararSaldoInformakon(
      [{ codigo: '18.1.6', nf_descontavel: 3265.49 }],
      saldo,
    )
    expect(r.faltantes).toHaveLength(0)
  })

  it('ordena o que exige ação primeiro, e pela maior falta', () => {
    const r = compararSaldoInformakon(
      [
        { codigo: '9.1.1', nf_descontavel: 500000 },     // falta 86.057,33
        { codigo: '18.1.6', nf_descontavel: 1_000_000 }, // falta 996.734,52
      ],
      saldo,
    )
    expect(r.linhas[0].chave).toBe('18')
    expect(r.linhas[1].chave).toBe('9')
  })

  it('sem retrato nenhum, nada é acusado', () => {
    const r = compararSaldoInformakon([{ codigo: '18.1.6', nf_descontavel: 9999 }], [])
    expect(r.faltantes).toHaveLength(0)
    expect(r.semRetrato).toHaveLength(1)
  })
})

describe('escopo de consulta (abrir as notas do macro item)', () => {
  const saldo = [
    { chave: '14', rotulo: 'COMBATE AO INCÊNDIO', valor: 481745.48 },
    { chave: '19.1.2', rotulo: 'FECHAMENTOS…', valor: 220000 },
  ]

  it('grupos 1..18 apontam para o UUID do grupo macro', () => {
    const r = compararSaldoInformakon(
      [
        { codigo: '14.1.1', nf_descontavel: 300000, grupo_id: 'uuid-grupo-14', detalhamento_id: 'uuid-det-a' },
        { codigo: '14.2.6', nf_descontavel: 211015.55, grupo_id: 'uuid-grupo-14', detalhamento_id: 'uuid-det-b' },
      ],
      saldo,
    )
    const g14 = r.linhas.find(l => l.chave === '14')!
    expect(g14.scopeId).toBe('uuid-grupo-14')
    expect(g14.boletim).toBeCloseTo(511015.55, 2)
    expect(g14.diferenca).toBeCloseTo(29270.07, 2)   // o caso real do usuário
  })

  it('o grupo 19 aponta para o detalhamento — é assim que o ERP quebra', () => {
    const r = compararSaldoInformakon(
      [{ codigo: '19.1.2', nf_descontavel: 1000, grupo_id: 'uuid-grupo-19', detalhamento_id: 'uuid-det-1912' }],
      saldo,
    )
    expect(r.linhas.find(l => l.chave === '19.1.2')!.scopeId).toBe('uuid-det-1912')
  })

  it('sem id na linha, o escopo fica nulo em vez de inventar', () => {
    const r = compararSaldoInformakon([{ codigo: '14.1.1', nf_descontavel: 500000 }], saldo)
    expect(r.linhas.find(l => l.chave === '14')!.scopeId).toBeNull()
  })
})
