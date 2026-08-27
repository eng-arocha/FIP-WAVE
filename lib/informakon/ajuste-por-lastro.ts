/**
 * Ajuste do percentual pelo lastro real do Informakon.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REGRA, NAS PALAVRAS DA ENGENHEIRA
 *
 *   "a única diferença entre o coeficiente ajustado e a medição normal é só
 *    esse valor de faturamento direto que eu não estou medindo, porque não
 *    consigo descontar — que eu não tenho nota"
 *
 * Ou seja: mede-se o físico; do valor medido tira-se apenas o material que
 * não tem nota lançada no ERP para bancar o desconto. Nada mais.
 *
 *     por item     total medido = p × G     desconto = p × M
 *     por grupo    falta = Σ desconto − "Vlr. a Desc" do grupo no Informakon
 *     ajuste       valor ajustado = total medido − parcela da falta
 *     percentual   % = valor ajustado ÷ G
 *
 * Conferido contra a Folha de Rosto da Medição 5, que fecha no centavo:
 * grupo 1 (falta 50.291,03) e grupo 18 (falta 9.902,37) são os dois únicos
 * com lastro insuficiente, e os dois itens ajustados dão exatamente
 * 74.636,73 e 8.863,33.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMO A FALTA SE DISTRIBUI DENTRO DO GRUPO — cascata pelo maior
 *
 * Decisão do usuário: o item de MAIOR desconto absorve a falta; o que não
 * couber nele escorre para o próximo maior, e assim por diante.
 *
 * O teto de cada item é o DESCONTO dele, nunca o total medido. Cortar além do
 * desconto comeria o serviço executado — a Wave receberia menos do que fez, e
 * o erro deixaria de ser conservador para virar prejuízo dela.
 *
 * Qualquer distribuição dá o mesmo total no grupo, que é o número que o ERP
 * recebe no bloco. A ordem só decide o percentual de cada item.
 */

/** Um item do grupo, já com o físico do período aplicado. */
export interface ItemAjuste {
  /** Chave do item — o detalhamento. */
  id: string
  /** `p × G` — o que a medição vale neste item. */
  totalMedido: number
  /** `p × M` — o material do período, o desconto ideal. */
  desconto: number
}

export interface ItemAjustado extends ItemAjuste {
  /** Parcela da falta do grupo que este item absorveu. */
  cortado: number
  /** `desconto − cortado`: o que efetivamente se digita. */
  descontoAjustado: number
  /** `totalMedido − cortado`: a base do percentual. */
  totalAjustado: number
}

export interface AjusteDoGrupo {
  itens: ItemAjustado[]
  /** Σ desconto ideal do grupo. */
  descontoIdeal: number
  /** Lastro informado do ERP. */
  lastro: number
  /** Quanto o grupo pediu a mais do que existe lançado. */
  falta: number
  /** Σ cortado. Igual a `falta`, salvo se nem o grupo inteiro comportar. */
  cortado: number
  /**
   * Falta que não coube em item nenhum — o desconto do grupo já era menor do
   * que a falta apurada. Só acontece com dado inconsistente; fica explícito
   * em vez de sumir num clamp.
   */
  sobra: number
}

const cent = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * Aplica a falta de lastro de UM macro grupo aos itens dele.
 *
 * `lastro` é o "Vlr. a Desc" daquele grupo no retrato do Informakon. Passe
 * `null` quando o grupo não aparece no retrato: sem número do outro lado não
 * dá para afirmar que falta alguma coisa, e chutar zero derrubaria o
 * percentual do grupo inteiro.
 */
export function ajustarGrupoPeloLastro(
  itens: ItemAjuste[],
  lastro: number | null,
): AjusteDoGrupo {
  const descontoIdeal = cent(itens.reduce((s, i) => s + num(i.desconto), 0))
  const semAjuste = (falta: number): AjusteDoGrupo => ({
    itens: itens.map(i => ({
      ...i,
      cortado: 0,
      descontoAjustado: cent(num(i.desconto)),
      totalAjustado: cent(num(i.totalMedido)),
    })),
    descontoIdeal,
    lastro: num(lastro),
    falta,
    cortado: 0,
    sobra: 0,
  })

  if (lastro === null || lastro === undefined) return semAjuste(0)
  const falta = cent(descontoIdeal - num(lastro))
  if (!(falta > 0.005)) return semAjuste(0)

  // Cascata pelo maior desconto. O desempate pelo id mantém o resultado
  // estável entre um refresh e outro — sem ele a ordem viria da query.
  const ordem = [...itens].sort((a, b) => {
    const d = num(b.desconto) - num(a.desconto)
    return d !== 0 ? d : String(a.id).localeCompare(String(b.id), 'pt-BR', { numeric: true })
  })

  const cortePorId = new Map<string, number>()
  let restante = falta
  for (const it of ordem) {
    if (restante <= 0.005) break
    const cabe = cent(Math.min(num(it.desconto), restante))
    if (cabe <= 0) continue
    cortePorId.set(it.id, cabe)
    restante = cent(restante - cabe)
  }

  const ajustados: ItemAjustado[] = itens.map(i => {
    const cortado = cortePorId.get(i.id) ?? 0
    return {
      ...i,
      cortado,
      descontoAjustado: cent(num(i.desconto) - cortado),
      totalAjustado: cent(num(i.totalMedido) - cortado),
    }
  })

  return {
    itens: ajustados,
    descontoIdeal,
    lastro: num(lastro),
    falta,
    cortado: cent(falta - restante),
    sobra: restante,
  }
}

/** `valor ajustado ÷ valor global`. Zero quando o item não tem valor global. */
export function pctDoAjuste(totalAjustado: number, valorGlobalItem: number): number {
  const g = num(valorGlobalItem)
  return g > 0 ? (num(totalAjustado) / g) * 100 : 0
}
