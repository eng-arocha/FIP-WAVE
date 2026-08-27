import { describe, it, expect } from 'vitest'
import { ehPedidoDeServicoWave } from './informacon-data'
import { calcularDescontoDeMaterial } from './desconto-material'

/**
 * Regressões do desconto de NF de material (migration 074).
 *
 * Caso real que motivou: na medição 004/2026-07 do WAVE, R$ 390.251,16 de NF
 * de SERVIÇO da Wave estavam entrando no desconto de MATERIAL, porque o
 * pedido da NF de serviço é criado na mesma tabela dos pedidos de material e
 * o `tipo` não era persistido.
 */
describe('ehPedidoDeServicoWave — tira a NF de serviço da conta de material', () => {
  it('reconhece pelo tipo (caminho normal, pós-migration 074)', () => {
    expect(ehPedidoDeServicoWave({ tipo: 'wave_servico' })).toBe(true)
    expect(ehPedidoDeServicoWave({ tipo: 'fip_material' })).toBe(false)
    expect(ehPedidoDeServicoWave({ tipo: 'material_fornecedor' })).toBe(false)
  })

  it('reconhece pelo CNPJ quando a coluna tipo ainda não existe', () => {
    expect(ehPedidoDeServicoWave({ fornecedor_cnpj: '65.528.046/0001-23' })).toBe(true)
  })

  it('reconhece pela razão social como última rede de segurança', () => {
    expect(ehPedidoDeServicoWave({ fornecedor_razao_social: 'WAVE INSTALACOES SPE LTDA' })).toBe(true)
    expect(ehPedidoDeServicoWave({ fornecedor_razao_social: '  wave instalacoes spe ltda ' })).toBe(true)
  })

  it('NÃO confunde a NF de material da FIP com a NF de serviço da Wave', () => {
    expect(ehPedidoDeServicoWave({
      tipo: 'fip_material',
      fornecedor_cnpj: '26.736.376/0001-52',
      fornecedor_razao_social: 'FIP ENGENHARIA ELETRICA LTDA',
    })).toBe(false)
  })

  it('não trata fornecedor de material comum como pedido da Wave', () => {
    expect(ehPedidoDeServicoWave({
      fornecedor_cnpj: '11.111.111/0001-11',
      fornecedor_razao_social: 'M. A. FROTA E CIA LTDA',
    })).toBe(false)
    // "WAVE" no meio do nome não basta — o match é ancorado no início.
    expect(ehPedidoDeServicoWave({ fornecedor_razao_social: 'MICROWAVE COMERCIO LTDA' })).toBe(false)
  })

  it('pedido sem nenhum dos campos preenchidos não é da Wave', () => {
    expect(ehPedidoDeServicoWave({})).toBe(false)
    expect(ehPedidoDeServicoWave({ tipo: null, fornecedor_cnpj: null, fornecedor_razao_social: null })).toBe(false)
  })
})

/**
 * Saldo corrido: a mesma NF não pode ser descontável em toda medição.
 *
 * Chama a função de produção com um único item sem grupo — sem grupo não há
 * transbordo, então o resultado é exatamente a regra de saldo corrido isolada.
 * Antes isto era uma cópia da fórmula escrita à mão aqui dentro, que continuou
 * passando depois que a regra de produção mudou para apurar por grupo macro —
 * um teste que não testava mais nada.
 */
function nfDescontavel(
  matMedido: number,
  nfEmitida: number,
  nfJaAbatida: number,
  matAcumulado: number = matMedido,
) {
  const r = calcularDescontoDeMaterial([
    { detalhamentoId: 'x', matMedido, matAcumulado, nfAlocada: nfEmitida, nfJaAbatida },
  ])
  return r.get('x')!.total
}

describe('saldo corrido do desconto de NF de material', () => {
  it('primeira medição abate até o material medido', () => {
    expect(nfDescontavel(100, 1000, 0)).toBe(100)
  })

  it('REGRESSÃO: NF já abatida antes não volta a descontar', () => {
    // NF de R$ 100 emitida e abatida integralmente na medição anterior.
    expect(nfDescontavel(100, 100, 100)).toBe(0)
  })

  it('NF que sobrou de mês anterior continua disponível (não se perde)', () => {
    // Emitida 1000, abatida só 300 → sobram 700 pra esta medição. Os 300 já
    // abatidos vieram de 300 de material medido antes, então o acumulado é
    // esse material anterior mais o do período.
    expect(nfDescontavel(500, 1000, 300, 800)).toBe(500)
    expect(nfDescontavel(900, 1000, 300, 1200)).toBe(700)
  })

  it('a régua é o material ACUMULADO, não o do período', () => {
    // Só 500 de material foram medidos na obra inteira e 300 já descontaram:
    // sobram 200, mesmo com 1000 de nota emitida. Descontar 500 de novo seria
    // abater nota de material que ainda não foi executado.
    expect(nfDescontavel(500, 1000, 300, 500)).toBe(200)
  })

  it('nunca passa do material medido, mesmo com NF gigante', () => {
    // Caso real: material comprado muito antes de instalar (9.1.1 do WAVE
    // tinha R$ 285 mil de NF contra R$ 13 mil de material medido).
    expect(nfDescontavel(13080.77, 285672.19, 0)).toBe(13080.77)
  })

  it('nunca fica negativo quando o abatido passou da NF emitida', () => {
    expect(nfDescontavel(100, 50, 80)).toBe(0)
  })

  it('item sem NF nenhuma não abate nada', () => {
    expect(nfDescontavel(76000, 0, 0)).toBe(0)
  })
})
