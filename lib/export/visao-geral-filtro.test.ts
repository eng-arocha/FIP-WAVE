import { describe, it, expect } from 'vitest'
import { aplicarFiltrosArvore, valoresDistintos, celulaDaColuna } from './visao-geral-filtro'
import type { FlatRow } from './visao-geral'
import type { DashboardItem } from '@/types/dashboard'

function item(over: Partial<DashboardItem> & { id: string }): DashboardItem {
  return {
    codigo: '1', nome: 'Item', nivel: 3, pai_id: null, tem_filhos: false,
    valor_contratado_total: 0, valor_contratado_material: 0, valor_contratado_servico: 0,
    realizado_total: 0, realizado_material: 0, realizado_servico: 0,
    servico_em_aprovacao: 0, material_medido: 0, material_em_aprovacao: 0, material_descontado: 0,
    saldo_aprovado_material: 0, saldo_medicao_servico: 0,
    ...over,
  } as DashboardItem
}

// Grupo 3 → tarefa 3.2 → 3.2.11 (tipo, nada a pedir) e 3.2.12 (cobertura, 1.000 a pedir)
//        → tarefa 3.1 → 3.1.1 (zerado)
const g3 = item({ id: 'g3', codigo: '3', nome: 'ELÉTRICA', nivel: 1, tem_filhos: true, valor_contratado_material: 99_999 })
const t32 = item({ id: 't32', codigo: '3.2', nome: 'CABEAMENTO', nivel: 2, pai_id: 'g3', tem_filhos: true, valor_contratado_material: 88_888 })
const d3211 = item({ id: 'd3211', codigo: '3.2.11', nome: 'PAV TIPO', pai_id: 't32', valor_contratado_material: 500, realizado_material: 400, saldo_aprovado_material: 100 })
const d3212 = item({ id: 'd3212', codigo: '3.2.12', nome: 'PAV COBERTURA', pai_id: 't32', valor_contratado_material: 1000 })
const t31 = item({ id: 't31', codigo: '3.1', nome: 'INFRA', nivel: 2, pai_id: 'g3', tem_filhos: true })
const d311 = item({ id: 'd311', codigo: '3.1.1', nome: 'SUBSOLO', pai_id: 't31', valor_contratado_material: 50, realizado_material: 50 })
const rows: FlatRow[] = [
  { item: g3, level: 0 }, { item: t32, level: 1 }, { item: d3211, level: 2 }, { item: d3212, level: 2 },
  { item: t31, level: 1 }, { item: d311, level: 2 },
]

describe('aplicarFiltrosArvore', () => {
  it('filtra os itens e mantém só os pais deles, somando o que passou', () => {
    const out = aplicarFiltrosArvore(rows, 'material', { saldo: { selecionados: null, condicao: { op: 'gt', valor: '0' } } })
    expect(out.map(r => r.item.id)).toEqual(['g3', 't32', 'd3212'])
    // Pai mostra a soma dos itens visíveis, não o total do servidor
    expect(out[0].item.valor_contratado_material).toBe(1000)
    expect(out[1].item.valor_contratado_material).toBe(1000)
  })

  it('filtro de texto no item e lista de valores', () => {
    const porTexto = aplicarFiltrosArvore(rows, 'material', { item: { selecionados: null, condicao: { op: 'contains', valor: 'tipo' } } })
    expect(porTexto.map(r => r.item.id)).toEqual(['g3', 't32', 'd3211'])
    const porLista = aplicarFiltrosArvore(rows, 'material', { realizado: { selecionados: ['50,00'], condicao: null } })
    expect(porLista.map(r => r.item.id)).toEqual(['g3', 't31', 'd311'])
  })

  it('respeita o escopo e rebaseia o nível', () => {
    const out = aplicarFiltrosArvore(rows, 'material', {}, 't32')
    expect(out.map(r => [r.item.id, r.level])).toEqual([['d3211', 0], ['d3212', 0]])
  })

  it('sem item que passe, nada aparece', () => {
    expect(aplicarFiltrosArvore(rows, 'material', { saldo: { selecionados: null, condicao: { op: 'lt', valor: '0' } } })).toEqual([])
  })
})

describe('valoresDistintos', () => {
  it('lista em cascata: ignora o filtro da própria coluna, respeita os outros', () => {
    const filtros = {
      saldo: { selecionados: ['0,00'], condicao: null },
      item: { selecionados: null, condicao: { op: 'startsWith' as const, valor: '3.2' } },
    }
    expect(valoresDistintos(rows, 'material', filtros, 'saldo').map(v => v.texto)).toEqual(['0,00', '1.000,00'])
    expect(valoresDistintos(rows, 'material', filtros, 'item').map(v => v.texto)).toEqual(['3.1.1 SUBSOLO', '3.2.11 PAV TIPO'])
  })

  it('célula sem base vira (Vazias)', () => {
    expect(celulaDaColuna(d3212, 'material', 'pctMedido').texto).toBe('0,0%')
    expect(celulaDaColuna(item({ id: 'z' }), 'material', 'pctMedido').texto).toBe('(Vazias)')
  })
})
