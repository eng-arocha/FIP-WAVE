import { describe, it, expect } from 'vitest'
import { valoresPorModo, filtrarRows, totalizarRows, rotuloSaldo, type FlatRow } from './visao-geral'
import type { DashboardItem } from '@/types/dashboard'

function item(over: Partial<DashboardItem> & { id: string }): DashboardItem {
  return {
    id: over.id,
    codigo: over.codigo ?? '1',
    nome: over.nome ?? 'Item',
    nivel: over.nivel ?? 1,
    pai_id: over.pai_id ?? null,
    tem_filhos: over.tem_filhos ?? false,
    valor_contratado_total: over.valor_contratado_total ?? 0,
    valor_contratado_material: over.valor_contratado_material ?? 0,
    valor_contratado_servico: over.valor_contratado_servico ?? 0,
    realizado_total: over.realizado_total ?? 0,
    realizado_material: over.realizado_material ?? 0,
    realizado_servico: over.realizado_servico ?? 0,
    saldo_aprovado_material: over.saldo_aprovado_material ?? 0,
    saldo_medicao_servico: over.saldo_medicao_servico ?? 0,
  } as DashboardItem
}

describe('valoresPorModo', () => {
  const it11 = item({
    id: 'd1',
    codigo: '1.1',
    valor_contratado_total: 30747.78,
    valor_contratado_material: 14403.44,
    valor_contratado_servico: 16344.34,
    realizado_total: 27209.91,
    realizado_material: 12500,
    realizado_servico: 14709.91,
    saldo_aprovado_material: 0,
    saldo_medicao_servico: 14709.91,
  })

  it('modo total usa contratado − realizado', () => {
    const v = valoresPorModo(it11, 'total')
    expect(v.contratado).toBe(30747.78)
    expect(v.realizado).toBe(27209.91)
    expect(v.saldo).toBeCloseTo(3537.87, 2)
  })

  it('modo material e serviço leem os campos da natureza', () => {
    expect(valoresPorModo(it11, 'material').contratado).toBe(14403.44)
    expect(valoresPorModo(it11, 'servico').contratado).toBe(16344.34)
  })

  it('NÃO clampa o saldo em zero — item estourado aparece negativo', () => {
    const estourado = item({ id: 'x', valor_contratado_total: 30747.78, realizado_total: 40173 })
    expect(valoresPorModo(estourado, 'total').saldo).toBeCloseTo(-9425.22, 2)
  })
})

describe('rotuloSaldo', () => {
  it('não depende de nenhuma linha', () => {
    expect(rotuloSaldo('material')).toBe('Saldo aprov.')
    expect(rotuloSaldo('servico')).toBe('Saldo med.')
    expect(rotuloSaldo('total')).toBe('Saldo a executar')
  })
})

describe('totalizarRows — sem dupla contagem entre níveis', () => {
  // Grupo 1 (1000) → tarefa 1.1 (600) + tarefa 1.2 (400)
  const grupo = item({ id: 'g1', codigo: '1', nivel: 1, tem_filhos: true, valor_contratado_total: 1000, realizado_total: 300 })
  const t11 = item({ id: 't11', codigo: '1.1', nivel: 2, pai_id: 'g1', valor_contratado_total: 600, realizado_total: 200 })
  const t12 = item({ id: 't12', codigo: '1.2', nivel: 2, pai_id: 'g1', valor_contratado_total: 400, realizado_total: 100 })

  it('conta só o pai quando o pai está presente', () => {
    const rows: FlatRow[] = [
      { item: grupo, level: 0 },
      { item: t11, level: 1 },
      { item: t12, level: 1 },
    ]
    const t = totalizarRows(rows, 'total')
    expect(t.contratado).toBe(1000)
    expect(t.realizado).toBe(300)
  })

  it('conta os filhos quando o pai foi filtrado fora', () => {
    // Era o bug: sem nenhuma linha de nível 0, o TOTAL saía 0,00.
    const rows: FlatRow[] = [
      { item: t11, level: 1 },
      { item: t12, level: 1 },
    ]
    const t = totalizarRows(rows, 'total')
    expect(t.contratado).toBe(1000)
    expect(t.realizado).toBe(300)
  })

  it('conta uma única tarefa filtrada isoladamente', () => {
    const t = totalizarRows([{ item: t11, level: 1 }], 'total')
    expect(t.contratado).toBe(600)
    expect(t.realizado).toBe(200)
  })

  it('lista vazia soma zero', () => {
    expect(totalizarRows([], 'total')).toEqual({ contratado: 0, realizado: 0, saldo: 0 })
  })
})

describe('filtrarRows', () => {
  const comSaldo = item({ id: 'a', codigo: '1.1', nome: 'ENTRADA', valor_contratado_total: 100, realizado_total: 40 })
  const zerado = item({ id: 'b', codigo: '1.2', nome: 'CABEAMENTO', valor_contratado_total: 100, realizado_total: 100 })
  const estourado = item({ id: 'c', codigo: '1.3', nome: 'QUADROS', valor_contratado_total: 100, realizado_total: 140 })
  const rows: FlatRow[] = [comSaldo, zerado, estourado].map(i => ({ item: i, level: 0 }))

  it('filtra por código e por nome', () => {
    expect(filtrarRows(rows, 'total', { texto: '1.2' }).map(r => r.item.id)).toEqual(['b'])
    expect(filtrarRows(rows, 'total', { texto: 'quadros' }).map(r => r.item.id)).toEqual(['c'])
  })

  it('"somente com saldo" mantém os ESTOURADOS e descarta só o saldo zerado', () => {
    const ids = filtrarRows(rows, 'total', { somenteSaldo: true }).map(r => r.item.id)
    expect(ids).toContain('a')
    expect(ids).toContain('c')
    expect(ids).not.toContain('b')
  })
})
