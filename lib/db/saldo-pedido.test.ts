import { describe, it, expect } from 'vitest'
import { calcularSaldoPedido } from './saldo-pedido'

describe('calcularSaldoPedido', () => {
  it('desconta NFs aprovadas — regressão do saldo inflado no encerramento', () => {
    // Caso real do pedido FIP-0007: 139.264,86 com 122.377,44 já em NF
    // aprovada. Antes da correção o filtro usava o status legado 'validada',
    // nada era descontado e a UI oferecia devolver o pedido inteiro.
    const s = calcularSaldoPedido(139264.86, [
      { valor: 122377.44, status: 'aprovada' },
    ])
    expect(s.total_nf_ativas).toBeCloseTo(122377.44, 2)
    expect(s.saldo_liquido).toBeCloseTo(16887.42, 2)
    expect(s.saldo_liquido).not.toBeCloseTo(139264.86, 2)
  })

  it('NF aguardando aprovação e em correção também reservam saldo', () => {
    const s = calcularSaldoPedido(1000, [
      { valor: 100, status: 'aprovada' },
      { valor: 200, status: 'aguardando_aprovacao' },
      { valor: 50, status: 'em_correcao' },
    ])
    expect(s.total_nf_aprovadas).toBe(100)
    expect(s.total_nf_pendentes).toBe(250)
    expect(s.total_nf_ativas).toBe(350)
    expect(s.saldo_liquido).toBe(650)
  })

  it('NF cancelada (e o legado rejeitada) não reserva saldo', () => {
    const s = calcularSaldoPedido(1000, [
      { valor: 400, status: 'cancelada' },
      { valor: 300, status: 'rejeitada' },
    ])
    expect(s.total_nf_ativas).toBe(0)
    expect(s.saldo_liquido).toBe(1000)
  })

  it('pedido sem NF tem saldo igual ao valor total', () => {
    const s = calcularSaldoPedido(500, [])
    expect(s.saldo_liquido).toBe(500)
    expect(s.pct_utilizado).toBe(0)
    expect(s.alerta).toBe('ok')
  })

  it('pedido totalmente coberto por NF fica esgotado, sem saldo a devolver', () => {
    const s = calcularSaldoPedido(1000, [{ valor: 1000, status: 'aprovada' }])
    expect(s.saldo_liquido).toBe(0)
    expect(s.alerta).toBe('esgotado')
  })

  it('classifica os alertas por faixa de utilização', () => {
    expect(calcularSaldoPedido(1000, [{ valor: 850, status: 'aprovada' }]).alerta).toBe('atencao')
    expect(calcularSaldoPedido(1000, [{ valor: 960, status: 'aprovada' }]).alerta).toBe('critico')
  })

  it('aceita valores em string (numeric do Postgres) e lista nula', () => {
    const s = calcularSaldoPedido('1000.00', [{ valor: '250.50', status: 'aprovada' }])
    expect(s.saldo_liquido).toBeCloseTo(749.5, 2)
    expect(calcularSaldoPedido(100, null).saldo_liquido).toBe(100)
  })
})
