/**
 * Compara o que o BOLETIM manda descontar contra o que está realmente
 * lançado no Informakon — o "teto de realidade".
 *
 * O Informakon só desconta nota que já existe lá. Se o boletim pede R$ 100 mil
 * de desconto num macro item e o ERP só tem R$ 50 mil lançados, o lançamento
 * não fecha: ou falta emitir/lançar nota, ou o site está pedindo demais.
 * Descobrir isso ANTES é a diferença entre corrigir e refazer.
 *
 * A comparação é por MACRO ITEM porque é a única granularidade em que os dois
 * lados têm número: o Informakon consolida a nota no macro item, o boletim
 * mede por detalhamento. Comparar item a item nunca fecharia.
 */

/**
 * Chave de comparação a partir do código do detalhamento.
 *
 * Grupos 1..18 comparam no macro grupo ('18.1.6' → '18'). O grupo 19 vem
 * quebrado em detalhamento no relatório do Informakon ('19.1.1' e '19.1.2'),
 * então ali a chave é o código inteiro — mesma regra de
 * `calcularConciliacaoPorGrupo`.
 */
export function chaveMacroItem(codigo: string | null | undefined): string {
  const s = String(codigo ?? '').trim()
  if (!s) return ''
  if (s.startsWith('19.')) return s
  return s.split('.')[0]
}

export interface LinhaBoletimComparavel {
  codigo: string
  /** Quanto esta linha manda descontar de nota nesta medição. */
  nf_descontavel: number
}

export interface SaldoInformakonComparavel {
  /** '1'..'18' para grupo macro, '19.1.1'/'19.1.2' para o grupo 19. */
  chave: string
  rotulo: string
  valor: number
}

export interface LinhaComparacao {
  chave: string
  rotulo: string
  /** Σ `nf_descontavel` das linhas do macro item nesta medição. */
  boletim: number
  /** "Vlr. a Desc" informado. `null` = macro item ausente do retrato. */
  informakon: number | null
  /** boletim − informakon. Positivo = o boletim pede mais do que existe. */
  diferenca: number
  /** true quando falta lançamento no Informakon para fechar a medição. */
  falta: boolean
}

export interface ComparacaoSaldo {
  linhas: LinhaComparacao[]
  /** Só os macro itens em que falta lançamento — o que exige ação. */
  faltantes: LinhaComparacao[]
  totalBoletim: number
  totalInformakon: number
  /** Soma do que falta lançar. Zero = a medição fecha do outro lado. */
  totalFaltante: number
  /** Macro itens do boletim sem linha no retrato — não dá pra afirmar nada. */
  semRetrato: LinhaComparacao[]
}

/** Centavo de arredondamento não é divergência. */
const TOLERANCIA = 0.01

export function compararSaldoInformakon(
  linhasBoletim: LinhaBoletimComparavel[],
  saldo: SaldoInformakonComparavel[],
): ComparacaoSaldo {
  const porChaveBoletim = new Map<string, number>()
  for (const l of linhasBoletim) {
    const k = chaveMacroItem(l.codigo)
    if (!k) continue
    const v = Number(l.nf_descontavel) || 0
    if (v === 0 && !porChaveBoletim.has(k)) porChaveBoletim.set(k, 0)
    else porChaveBoletim.set(k, (porChaveBoletim.get(k) || 0) + v)
  }

  const porChaveInformakon = new Map<string, { valor: number; rotulo: string }>()
  for (const s of saldo) {
    const k = String(s.chave ?? '').trim()
    if (!k) continue
    const atual = porChaveInformakon.get(k)
    if (atual) atual.valor += Number(s.valor) || 0
    else porChaveInformakon.set(k, { valor: Number(s.valor) || 0, rotulo: s.rotulo })
  }

  const chaves = new Set<string>([...porChaveBoletim.keys(), ...porChaveInformakon.keys()])
  const linhas: LinhaComparacao[] = []

  for (const chave of chaves) {
    const boletim = Math.round((porChaveBoletim.get(chave) || 0) * 100) / 100
    const doErp = porChaveInformakon.get(chave)
    // Macro item que só existe no retrato e não tem desconto nesta medição
    // não é informação — some, senão o painel vira ruído com 18 linhas.
    if (!porChaveBoletim.has(chave) && boletim === 0) continue

    const informakon = doErp ? Math.round(doErp.valor * 100) / 100 : null
    const diferenca = informakon === null ? 0 : Math.round((boletim - informakon) * 100) / 100
    linhas.push({
      chave,
      rotulo: doErp?.rotulo ?? `Macro item ${chave}`,
      boletim,
      informakon,
      diferenca,
      falta: informakon !== null && diferenca > TOLERANCIA,
    })
  }

  linhas.sort((a, b) => {
    // O que exige ação primeiro; depois por tamanho da falta.
    if (a.falta !== b.falta) return a.falta ? -1 : 1
    if (a.falta) return b.diferenca - a.diferenca
    return a.chave.localeCompare(b.chave, 'pt-BR', { numeric: true })
  })

  const faltantes = linhas.filter(l => l.falta)
  return {
    linhas,
    faltantes,
    totalBoletim: Math.round(linhas.reduce((s, l) => s + l.boletim, 0) * 100) / 100,
    totalInformakon: Math.round(linhas.reduce((s, l) => s + (l.informakon ?? 0), 0) * 100) / 100,
    totalFaltante: Math.round(faltantes.reduce((s, l) => s + l.diferenca, 0) * 100) / 100,
    semRetrato: linhas.filter(l => l.informakon === null && l.boletim > TOLERANCIA),
  }
}
