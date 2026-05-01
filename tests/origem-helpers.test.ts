import { describe, it, expect } from 'vitest'
import { allocateNfToScope } from '@/lib/db/origem'

describe('allocateNfToScope', () => {
  it('aloca proporcionalmente quando todos os itens estao no escopo', () => {
    const itens = [
      { detalhamento_id: 'd1', valor_total: 60 },
      { detalhamento_id: 'd2', valor_total: 40 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1', 'd2']), 1000)
    expect(r).toBe(1000)
  })

  it('aloca apenas a parcela do escopo', () => {
    const itens = [
      { detalhamento_id: 'd1', valor_total: 60 },
      { detalhamento_id: 'd2', valor_total: 40 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1']), 1000)
    expect(r).toBeCloseTo(600, 6)
  })

  it('retorna 0 se nenhum item esta no escopo', () => {
    const itens = [{ detalhamento_id: 'd1', valor_total: 100 }]
    expect(allocateNfToScope(itens, new Set(['dx']), 500)).toBe(0)
  })

  it('retorna 0 se total de itens for zero', () => {
    expect(allocateNfToScope([], new Set(['d1']), 500)).toBe(0)
  })

  it('ignora itens sem detalhamento_id', () => {
    const itens = [
      { detalhamento_id: null, valor_total: 50 },
      { detalhamento_id: 'd1', valor_total: 50 },
    ]
    const r = allocateNfToScope(itens, new Set(['d1']), 200)
    expect(r).toBeCloseTo(100, 6)
  })
})
