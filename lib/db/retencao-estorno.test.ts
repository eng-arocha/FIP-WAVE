import { describe, it, expect } from 'vitest'
import { planejarEstornoRetencao } from './retencao'

const MED = 'med-5'

describe('planejarEstornoRetencao', () => {
  it('estorna crédito e débito da medição', () => {
    const plano = planejarEstornoRetencao([
      { tipo: 'credito', valor: 54734.53, origem_id: MED },
      { tipo: 'debito', valor: 54734.53, origem_id: MED },
    ], MED)
    expect(plano).toEqual({ estornar_debito: 54734.53, estornar_credito: 54734.53 })
  })

  it('ignora movimentos de outras medições', () => {
    const plano = planejarEstornoRetencao([
      { tipo: 'credito', valor: 100, origem_id: 'outra' },
      { tipo: 'debito', valor: 100, origem_id: 'outra' },
    ], MED)
    expect(plano).toEqual({ estornar_debito: 0, estornar_credito: 0 })
  })

  it('não estorna de novo o que já foi estornado (desfazer duas vezes)', () => {
    const plano = planejarEstornoRetencao([
      { tipo: 'credito', valor: 500, origem_id: MED },
      { tipo: 'debito', valor: 300, origem_id: MED },
      { tipo: 'reversao_debito', valor: 300, origem_id: MED },
      { tipo: 'reversao_credito', valor: 500, origem_id: MED },
      { tipo: 'credito', valor: 520, origem_id: MED },
    ], MED)
    expect(plano).toEqual({ estornar_debito: 0, estornar_credito: 520 })
  })

  it('crédito sem débito (NF Wave não absorveu) estorna só o crédito', () => {
    const plano = planejarEstornoRetencao([
      { tipo: 'credito', valor: 3800, origem_id: MED },
    ], MED)
    expect(plano).toEqual({ estornar_debito: 0, estornar_credito: 3800 })
  })
})
