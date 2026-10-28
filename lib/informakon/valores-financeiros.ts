/**
 * Os 5 números da tela "Valores Financeiros" do Informakon, congelados na
 * aprovação da medição. Spec: docs/superpowers/specs/2026-10-28-congelar-informakon-e-cortes.md
 *
 *     contratual − material − retenção − diversos = líquido
 *
 * O líquido é o valor do pedido Wave; a retenção é o crédito do livro-razão.
 * Antes o site calculava esses números por conta própria e, quando divergiam
 * do Informakon, eram corrigidos depois por SQL (manual-fix 095/096/097).
 *
 * Puro: sem banco. A rota de aprovação valida e compara com o boletim; a tela
 * usa as mesmas funções para avisar antes de enviar.
 */

export interface ValoresInformakon {
  /** Valor contratual lançado na medição. */
  contratual: number
  /** Material fornecido a descontar. */
  material: number
  retencao: number
  descontosDiversos: number
  liquido: number
}

export const CAMPOS_VALORES: Array<{ campo: keyof ValoresInformakon; rotulo: string }> = [
  { campo: 'contratual', rotulo: 'Valor contratual lançado' },
  { campo: 'material', rotulo: 'Material fornecido a descontar' },
  { campo: 'retencao', rotulo: 'Retenção' },
  { campo: 'descontosDiversos', rotulo: 'Descontos diversos' },
  { campo: 'liquido', rotulo: 'Valor líquido da medição' },
]

/** Soma que não fecha por até um centavo é arredondamento do ERP. */
export const TOLERANCIA_SOMA = 0.01
/** Acima disso, diferença entre o site e o Informakon exige justificativa. */
export const TOLERANCIA_DIVERGENCIA = 1

const cent = (n: number) => Math.round(n * 100) / 100

/** Líquido que a soma dos outros quatro dá. */
export function liquidoPelaSoma(v: Omit<ValoresInformakon, 'liquido'>): number {
  return cent(v.contratual - v.material - v.retencao - v.descontosDiversos)
}

/** `null` quando os valores são consistentes; senão, a mensagem de erro. */
export function validarValoresInformakon(v: ValoresInformakon): string | null {
  for (const { campo, rotulo } of CAMPOS_VALORES) {
    const n = v[campo]
    if (typeof n !== 'number' || !Number.isFinite(n)) return `${rotulo}: valor inválido.`
    if (n < 0) return `${rotulo}: não pode ser negativo.`
  }
  if (!(v.contratual > 0)) return 'Valor contratual lançado: precisa ser maior que zero.'
  const esperado = liquidoPelaSoma(v)
  if (Math.abs(esperado - v.liquido) > TOLERANCIA_SOMA + 1e-9) {
    return `A soma não fecha: contratual − material − retenção − diversos = ${fmt(esperado)}, ` +
      `mas o líquido informado é ${fmt(v.liquido)}. Confira os números na tela do Informakon.`
  }
  return null
}

export interface DivergenciaValor {
  campo: keyof ValoresInformakon
  rotulo: string
  informakon: number
  site: number
  diferenca: number
}

/** Campos em que o Informakon difere do site em mais de R$ 1,00. */
export function divergenciasComSite(
  informakon: ValoresInformakon,
  site: ValoresInformakon,
): DivergenciaValor[] {
  const out: DivergenciaValor[] = []
  for (const { campo, rotulo } of CAMPOS_VALORES) {
    const diferenca = cent(informakon[campo] - site[campo])
    if (Math.abs(diferenca) > TOLERANCIA_DIVERGENCIA) {
      out.push({ campo, rotulo, informakon: informakon[campo], site: site[campo], diferenca })
    }
  }
  return out
}

/**
 * Os mesmos 5 números pelo boletim do site (medição ABERTA, com o % real):
 * contratual = Σ a lançar, material = Σ desconto com lastro.
 */
export function valoresDoSite(totais: {
  informakon_a_lancar: number
  nf_descontavel: number
  retencao: number
  ajuste_material_anterior: number
}): ValoresInformakon {
  const contratual = cent(Number(totais.informakon_a_lancar) || 0)
  const material = cent(Number(totais.nf_descontavel) || 0)
  const retencao = cent(Number(totais.retencao) || 0)
  const descontosDiversos = cent(Number(totais.ajuste_material_anterior) || 0)
  return {
    contratual, material, retencao, descontosDiversos,
    liquido: liquidoPelaSoma({ contratual, material, retencao, descontosDiversos }),
  }
}

/**
 * Pré-preenchimento pela linha da medição no relatório importado (migration
 * 075). O relatório não tem "descontos diversos": sai da diferença.
 */
export function valoresDaImportacao(linha: {
  contratual: number
  material: number
  retencao: number
  aPagar: number
}): ValoresInformakon {
  const contratual = cent(linha.contratual)
  const material = cent(linha.material)
  const retencao = cent(linha.retencao)
  const liquido = cent(linha.aPagar)
  return {
    contratual, material, retencao, liquido,
    descontosDiversos: Math.max(0, cent(contratual - material - retencao - liquido)),
  }
}

function fmt(n: number): string {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
