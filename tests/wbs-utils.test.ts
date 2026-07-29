import { describe, it, expect } from 'vitest'
import { compareCodigo, descendantDetalhamentoIds, type WbsNode } from '@/lib/db/wbs-utils'

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

describe('compareCodigo', () => {
  it('ordena por segmento numérico, não por texto', () => {
    // A ordem lexicográfica (ORDER BY codigo no Postgres) produzia
    // 1.1.1 → 1.10.1 → 1.11.1 → … → 1.2.1, que é o bug relatado na
    // Fila de Aprovações.
    const codigos = ['1.10.1', '1.2.1', '1.1.1', '10.1.1', '2.1.1', '1.14.1']
    expect(codigos.slice().sort(compareCodigo)).toEqual([
      '1.1.1', '1.2.1', '1.10.1', '1.14.1', '2.1.1', '10.1.1',
    ])
  })

  it('ordena sufixos numéricos de dois dígitos dentro da mesma tarefa', () => {
    const codigos = ['10.1.10', '10.1.2', '10.1.15', '10.1.1']
    expect(codigos.slice().sort(compareCodigo)).toEqual([
      '10.1.1', '10.1.2', '10.1.10', '10.1.15',
    ])
  })

  it('pai vem antes do filho (segmento ausente conta como 0)', () => {
    expect(compareCodigo('1', '1.1')).toBeLessThan(0)
    expect(compareCodigo('1.1', '1.1.1')).toBeLessThan(0)
  })

  it('códigos iguais empatam', () => {
    expect(compareCodigo('3.2.1', '3.2.1')).toBe(0)
  })

  it('tolera nulo/vazio sem quebrar', () => {
    expect(() => compareCodigo('', '1.1')).not.toThrow()
    expect(compareCodigo(undefined as unknown as string, '1.1')).toBeLessThan(0)
  })
})
