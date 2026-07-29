import { describe, it, expect } from 'vitest'
import {
  basesDoDetalhamento,
  baseParaNatureza,
  ehPedidoDeServicoWave,
  naturezaDoPedido,
  nivelAlerta,
  piorAlerta,
} from './saldo-detalhamento'

describe('naturezaDoPedido — contra qual base o pedido consome saldo', () => {
  it('wave_servico consome a base de SERVIÇO', () => {
    expect(naturezaDoPedido({ tipo: 'wave_servico' })).toBe('servico')
  })

  it('material_fornecedor e fip_material consomem a base de MATERIAL', () => {
    expect(naturezaDoPedido({ tipo: 'material_fornecedor' })).toBe('material')
    expect(naturezaDoPedido({ tipo: 'fip_material' })).toBe('material')
  })

  it('cai pro CNPJ / razão social quando `tipo` não veio (base pré-migration 074)', () => {
    expect(naturezaDoPedido({ fornecedor_cnpj: '65.528.046/0001-23' })).toBe('servico')
    expect(naturezaDoPedido({ fornecedor_razao_social: 'WAVE INSTALACOES SPE LTDA' })).toBe('servico')
    expect(naturezaDoPedido({ fornecedor_razao_social: 'M. L GUILHERMINO' })).toBe('material')
  })

  it('não confunde fornecedor com "wave" no meio do nome', () => {
    expect(ehPedidoDeServicoWave({ fornecedor_razao_social: 'MICROWAVE COMERCIO LTDA' })).toBe(false)
  })

  it('pedido sem nenhuma informação é tratado como material', () => {
    expect(naturezaDoPedido({})).toBe('material')
  })
})

describe('basesDoDetalhamento', () => {
  it('usa as colunas GENERATED subtotal_material / subtotal_mo', () => {
    const b = basesDoDetalhamento({ subtotal_material: 14403.44, subtotal_mo: 20000, valor_total: 34403.44 })
    expect(b.material).toBe(14403.44)
    expect(b.servico).toBe(20000)
    expect(b.total).toBe(34403.44)
    expect(b.semQuebra).toBe(false)
  })

  it('deriva de qtde × unitário quando os subtotais não vieram', () => {
    const b = basesDoDetalhamento({
      quantidade_contratada: 2,
      valor_material_unit: 100,
      valor_servico_unit: 50,
      valor_unitario: 150,
    })
    expect(b.material).toBe(200)
    expect(b.servico).toBe(100)
    expect(b.total).toBe(300)
  })

  it('marca semQuebra quando o item não tem material nem MO preenchidos', () => {
    const b = basesDoDetalhamento({ subtotal_material: 0, subtotal_mo: 0, valor_total: 5000 })
    expect(b.semQuebra).toBe(true)
    expect(b.total).toBe(5000)
  })

  it('aceita strings (NUMERIC do Postgres chega como string via PostgREST)', () => {
    const b = basesDoDetalhamento({ subtotal_material: '1000.50', subtotal_mo: '499.50', valor_total: '1500.00' })
    expect(b.material).toBe(1000.5)
    expect(b.servico).toBe(499.5)
  })
})

describe('baseParaNatureza', () => {
  it('separa material de serviço quando o item tem a quebra', () => {
    const b = basesDoDetalhamento({ subtotal_material: 14403.44, subtotal_mo: 20000, valor_total: 34403.44 })
    expect(baseParaNatureza(b, 'material')).toBe(14403.44)
    expect(baseParaNatureza(b, 'servico')).toBe(20000)
  })

  it('usa o valor_total como base única quando não há quebra', () => {
    const b = basesDoDetalhamento({ subtotal_material: 0, subtotal_mo: 0, valor_total: 5000 })
    expect(baseParaNatureza(b, 'material')).toBe(5000)
    expect(baseParaNatureza(b, 'servico')).toBe(5000)
  })

  it('cai pro total quando só o lado da natureza está zerado (evita falso esgotado)', () => {
    const b = basesDoDetalhamento({ subtotal_material: 10000, subtotal_mo: 0, valor_total: 12000 })
    expect(baseParaNatureza(b, 'material')).toBe(10000)
    expect(baseParaNatureza(b, 'servico')).toBe(12000)
  })
})

describe('nivelAlerta / piorAlerta', () => {
  it('aplica o semáforo 80 / 95 / 100', () => {
    expect(nivelAlerta(0, 1000)).toBe('ok')
    expect(nivelAlerta(799, 1000)).toBe('ok')
    expect(nivelAlerta(800, 1000)).toBe('atencao')
    expect(nivelAlerta(950, 1000)).toBe('critico')
    expect(nivelAlerta(1000, 1000)).toBe('esgotado')
    expect(nivelAlerta(1200, 1000)).toBe('esgotado')
  })

  it('item sem base contratada não alarma', () => {
    expect(nivelAlerta(0, 0)).toBe('ok')
  })

  it('piorAlerta escolhe o nível mais severo entre material e serviço', () => {
    expect(piorAlerta('ok', 'esgotado')).toBe('esgotado')
    expect(piorAlerta('atencao', 'critico')).toBe('critico')
    expect(piorAlerta('ok', 'ok')).toBe('ok')
  })
})

describe('regressão: item 1.1.1 do WAVE-2025-001 aparecia esgotado com saldo negativo', () => {
  // Cenário reportado na Fila de Aprovações:
  //   contratado material R$ 14.403,44
  //   FIP-1403 M. L GUILHERMINO (material)            R$ 12.500,00
  //   FIP-0015 WAVE INSTALACOES SPE LTDA (serviço)    R$ 13.170,33
  // Antes, os dois eram debitados do material → saldo −R$ 11.266,89.
  const det = { subtotal_material: 14403.44, subtotal_mo: 20000, valor_total: 34403.44 }
  const bases = basesDoDetalhamento(det)

  const pedidos = [
    { fornecedor_razao_social: 'M. L GUILHERMINO', tipo: 'material_fornecedor', valor: 12500 },
    { fornecedor_razao_social: 'WAVE INSTALACOES SPE LTDA', tipo: 'wave_servico', valor: 13170.33 },
  ]

  const consumo = { material: 0, servico: 0 }
  for (const p of pedidos) consumo[naturezaDoPedido(p)] += p.valor

  it('debita cada pedido na sua própria base', () => {
    expect(consumo.material).toBe(12500)
    expect(consumo.servico).toBe(13170.33)
  })

  it('o material fica positivo e apenas em atenção, não esgotado', () => {
    const base = baseParaNatureza(bases, 'material')
    const saldo = base - consumo.material
    expect(saldo).toBeCloseTo(1903.44, 2)
    expect(saldo).toBeGreaterThan(0)
    expect(nivelAlerta(consumo.material, base)).toBe('atencao')
  })

  it('o serviço tem folga na base de MO', () => {
    const base = baseParaNatureza(bases, 'servico')
    const saldo = base - consumo.servico
    expect(saldo).toBeCloseTo(6829.67, 2)
    expect(nivelAlerta(consumo.servico, base)).toBe('ok')
  })
})
