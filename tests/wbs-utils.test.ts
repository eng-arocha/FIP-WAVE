import { describe, it, expect } from 'vitest'
import { descendantDetalhamentoIds, type WbsNode } from '@/lib/db/wbs-utils'

const nodes: WbsNode[] = [
  { id: 'g1', pai_id: null, nivel: 1 },
  { id: 'g2', pai_id: null, nivel: 1 },
  { id: 't1.1', pai_id: 'g1', nivel: 2 },
  { id: 't1.2', pai_id: 'g1', nivel: 2 },
  { id: 't2.1', pai_id: 'g2', nivel: 2 },
  { id: 'd1.1.1', pai_id: 't1.1', nivel: 3 },
  { id: 'd1.1.2', pai_id: 't1.1', nivel: 3 },
  { id: 'd1.2.1', pai_id: 't1.2', nivel: 3 },
  { id: 'd2.1.1', pai_id: 't2.1', nivel: 3 },
]

describe('descendantDetalhamentoIds', () => {
  it('null retorna todos os detalhamentos', () => {
    const r = descendantDetalhamentoIds(null, nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2', 'd1.2.1', 'd2.1.1']))
  })

  it('grupo retorna apenas detalhamentos sob ele', () => {
    const r = descendantDetalhamentoIds('g1', nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2', 'd1.2.1']))
  })

  it('tarefa retorna apenas seus filhos', () => {
    const r = descendantDetalhamentoIds('t1.1', nodes)
    expect(r).toEqual(new Set(['d1.1.1', 'd1.1.2']))
  })

  it('detalhamento retorna apenas si mesmo', () => {
    const r = descendantDetalhamentoIds('d1.2.1', nodes)
    expect(r).toEqual(new Set(['d1.2.1']))
  })

  it('id inexistente retorna vazio', () => {
    const r = descendantDetalhamentoIds('xxxx', nodes)
    expect(r).toEqual(new Set())
  })
})
