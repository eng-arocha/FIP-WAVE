import { describe, it, expect } from 'vitest'
import {
  validarValoresInformakon, divergenciasComSite, valoresDoSite, valoresDaImportacao, liquidoPelaSoma,
  type ValoresInformakon,
} from './valores-financeiros'

/** Tela "Valores Financeiros" da MED-007 (Informakon nº 3451) — manual-fix 097. */
const MED7: ValoresInformakon = {
  contratual: 1_834_551.81,
  material: 1_263_229.98,
  retencao: 91_727.59,
  descontosDiversos: 33.70,
  liquido: 479_560.54,
}

describe('validação da soma', () => {
  it('MED-007 fecha', () => {
    expect(liquidoPelaSoma(MED7)).toBe(479_560.54)
    expect(validarValoresInformakon(MED7)).toBeNull()
  })

  it('um centavo de arredondamento passa', () => {
    expect(validarValoresInformakon({ ...MED7, liquido: 479_560.55 })).toBeNull()
  })

  it('dois centavos errados no líquido são recusados', () => {
    expect(validarValoresInformakon({ ...MED7, liquido: 479_560.56 })).toMatch(/soma não fecha/)
  })

  it('a NF Wave antiga (449.761,62) não passa com os números do Informakon', () => {
    expect(validarValoresInformakon({ ...MED7, liquido: 449_761.62 })).toMatch(/soma não fecha/)
  })

  it('negativo, NaN e contratual zero são recusados', () => {
    expect(validarValoresInformakon({ ...MED7, retencao: -1 })).toMatch(/negativo/)
    expect(validarValoresInformakon({ ...MED7, material: NaN })).toMatch(/inválido/)
    expect(validarValoresInformakon({ contratual: 0, material: 0, retencao: 0, descontosDiversos: 0, liquido: 0 }))
      .toMatch(/maior que zero/)
  })
})

describe('comparação com o site', () => {
  // Boletim do site (096) com o % real: o 1.3.1 lançado a 100%, desconto só do
  // que tinha lastro — o retrato antes do 097.
  const site = valoresDoSite({
    informakon_a_lancar: 1_834_216.90,
    nf_descontavel: 1_262_423.66,
    retencao: 91_710.85,
    ajuste_material_anterior: 0,
  })

  it('o site calcula o líquido pela mesma soma', () => {
    expect(site.liquido).toBe(480_082.39)
  })

  it('lista só o que passa de R$ 1,00', () => {
    const d = divergenciasComSite(MED7, site)
    const campos = d.map(x => x.campo)
    expect(campos).toEqual(['contratual', 'material', 'retencao', 'descontosDiversos', 'liquido'])
    expect(d.find(x => x.campo === 'material')!.diferenca).toBe(806.32)
  })

  it('sem divergência quando bate dentro de R$ 1,00', () => {
    expect(divergenciasComSite(MED7, { ...MED7, retencao: MED7.retencao + 0.99 })).toEqual([])
  })
})

describe('pré-preenchimento pela importação', () => {
  it('descontos diversos saem da diferença', () => {
    const v = valoresDaImportacao({
      contratual: 1_834_551.81, material: 1_263_229.98, retencao: 91_727.59, aPagar: 479_560.54,
    })
    expect(v).toEqual(MED7)
    expect(validarValoresInformakon(v)).toBeNull()
  })

  it('diversos nunca negativo', () => {
    const v = valoresDaImportacao({ contratual: 100, material: 50, retencao: 5, aPagar: 46 })
    expect(v.descontosDiversos).toBe(0)
  })
})
