import { describe, it, expect } from 'vitest'
import { classificarCoberturaDoSite, classificarCoberturaPorBalde } from './desconto-material'

/**
 * Recorte da MED-007 (26/10/2026), grupo 1 — ELÉTRICA SUBESTAÇÃO, simplificado.
 *
 * As notas estão alocadas em A. As medições anteriores abateram o material de
 * B, que não tem nota: o abatimento foi feito com as notas de A, mas o
 * `jaConsumido` ficou registrado em B. Agora C mede material e A pede o
 * resto. Por item, A e C parecem cobertos e a FIP nunca é chamada.
 */
const GRUPO_1 = [
  { detalhamentoId: 'A', matMedido: 300, nfTerceiro: 300, pedidoAprovado: 300, jaConsumido: 0, balde: '1' },
  { detalhamentoId: 'B', matMedido: 0, nfTerceiro: 0, pedidoAprovado: 0, jaConsumido: 120, balde: '1' },
  { detalhamentoId: 'C', matMedido: 100, nfTerceiro: 0, pedidoAprovado: 0, jaConsumido: 0, balde: '1' },
]

describe('cobertura por item (regra antiga)', () => {
  it('não vê que as notas de A já foram gastas por B', () => {
    const r = classificarCoberturaDoSite(GRUPO_1)
    expect(r.get('A')!.fipPrecisaEmitir).toBe(0)
    expect(r.get('C')!.fipPrecisaEmitir).toBe(100)
  })
})

describe('cobertura por balde', () => {
  it('consome a cobertura no nível em que o abatimento foi feito', () => {
    const r = classificarCoberturaPorBalde(GRUPO_1)
    // Balde: cobertura 300 − 120 consumidos = 180; pendente 400 → FIP 220.
    const fip = ['A', 'B', 'C'].reduce((s, k) => s + r.get(k)!.fipPrecisaEmitir, 0)
    expect(fip).toBeCloseTo(220, 2)
    // Rateado pelo pendente de cada item: A 3/4, C 1/4, B nada.
    expect(r.get('A')!.fipPrecisaEmitir).toBeCloseTo(165, 2)
    expect(r.get('C')!.fipPrecisaEmitir).toBeCloseTo(55, 2)
    expect(r.get('B')!.fipPrecisaEmitir).toBe(0)
  })

  it('pedido aprovado sem nota é "nota a caminho" do balde inteiro', () => {
    const r = classificarCoberturaPorBalde([
      { detalhamentoId: 'A', matMedido: 100, nfTerceiro: 0, pedidoAprovado: 0, jaConsumido: 0, balde: '1' },
      { detalhamentoId: 'D', matMedido: 0, nfTerceiro: 0, pedidoAprovado: 40, jaConsumido: 0, balde: '1' },
    ])
    expect(r.get('A')!.notaACaminho).toBeCloseTo(40, 2)
    expect(r.get('A')!.fipPrecisaEmitir).toBeCloseTo(60, 2)
  })

  it('baldes diferentes não se compensam', () => {
    const r = classificarCoberturaPorBalde([
      { detalhamentoId: 'A', matMedido: 100, nfTerceiro: 0, pedidoAprovado: 0, jaConsumido: 0, balde: '1' },
      { detalhamentoId: 'Z', matMedido: 0, nfTerceiro: 500, pedidoAprovado: 500, jaConsumido: 0, balde: '2' },
    ])
    expect(r.get('A')!.fipPrecisaEmitir).toBe(100)
  })

  it('item sem balde cai na regra por item', () => {
    const r = classificarCoberturaPorBalde([
      { detalhamentoId: 'A', matMedido: 100, nfTerceiro: 30, pedidoAprovado: 30, jaConsumido: 0, balde: '' },
    ])
    expect(r.get('A')!.fipPrecisaEmitir).toBe(70)
  })

  it('cobertura sobrando no balde não vira FIP negativa', () => {
    const r = classificarCoberturaPorBalde([
      { detalhamentoId: 'A', matMedido: 50, nfTerceiro: 300, pedidoAprovado: 300, jaConsumido: 0, balde: '1' },
    ])
    expect(r.get('A')!.fipPrecisaEmitir).toBe(0)
    expect(r.get('A')!.notaACaminho).toBe(0)
  })
})
