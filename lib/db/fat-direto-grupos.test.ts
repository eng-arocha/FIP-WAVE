import { describe, it, expect } from 'vitest'
import { separarLinhasFipMaterial } from './fat-direto-grupos'

/** Linha mínima do boletim, só o que o separador olha. */
const linha = (detalhamento_id: string, fip_faturar: number, codigo = detalhamento_id) =>
  ({ detalhamento_id, fip_faturar, codigo })

describe('separarLinhasFipMaterial', () => {
  it('manda item de grupo faturamento direto pro lado do terceiro', () => {
    // 19.1.1 = administração de obra, 1 mês = R$ 38.000. Quem emite a nota é
    // o engenheiro; a FIP não pode receber pedido por isso.
    const r = separarLinhasFipMaterial(
      [linha('d-19-1-1', 38_000, '19.1.1')],
      new Set(['d-19-1-1']),
    )
    expect(r.fip).toHaveLength(0)
    expect(r.terceiro.map(l => l.codigo)).toEqual(['19.1.1'])
    expect(r.totalTerceiro).toBe(38_000)
  })

  it('não interfere nos itens normais do contrato', () => {
    const r = separarLinhasFipMaterial(
      [linha('d-14-2-1', 56_178.26, '14.2.1'), linha('d-8-1-1', 1_200, '8.1.1')],
      new Set(['d-19-1-1']),
    )
    expect(r.fip.map(l => l.codigo)).toEqual(['14.2.1', '8.1.1'])
    expect(r.terceiro).toHaveLength(0)
    expect(r.totalTerceiro).toBe(0)
  })

  it('separa os dois lados na mesma medição', () => {
    const r = separarLinhasFipMaterial(
      [
        linha('d-19-1-1', 38_000, '19.1.1'),
        linha('d-19-1-2', 220_000, '19.1.2'),
        linha('d-14-2-1', 5_000, '14.2.1'),
      ],
      new Set(['d-19-1-1', 'd-19-1-2']),
    )
    expect(r.fip.map(l => l.codigo)).toEqual(['14.2.1'])
    expect(r.totalTerceiro).toBe(258_000)
  })

  it('descarta linha sem material a faturar dos dois lados', () => {
    // fip_faturar == 0 significa que a NF do fornecedor já cobriu o medido —
    // é o caso desejado do grupo 19, e não deve aparecer em lugar nenhum.
    const r = separarLinhasFipMaterial(
      [linha('d-19-1-1', 0, '19.1.1'), linha('d-14-2-1', 0, '14.2.1')],
      new Set(['d-19-1-1']),
    )
    expect(r.fip).toHaveLength(0)
    expect(r.terceiro).toHaveLength(0)
    expect(r.totalTerceiro).toBe(0)
  })

  it('ignora valor negativo (não vira crédito de terceiro)', () => {
    const r = separarLinhasFipMaterial(
      [linha('d-19-1-1', -500, '19.1.1')],
      new Set(['d-19-1-1']),
    )
    expect(r.terceiro).toHaveLength(0)
    expect(r.totalTerceiro).toBe(0)
  })

  it('conjunto vazio de faturamento direto preserva o comportamento antigo', () => {
    const linhas = [linha('a', 10), linha('b', 20)]
    const r = separarLinhasFipMaterial(linhas, new Set())
    expect(r.fip).toHaveLength(2)
    expect(r.totalTerceiro).toBe(0)
  })
})
