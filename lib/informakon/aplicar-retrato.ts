/**
 * Camada ② — o teto do Informakon, por macro grupo. É ela que decide o
 * percentual a lançar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A REGRA
 *
 *     falta do grupo = Σ desconto ideal − "Vlr. a Desc" do grupo no Informakon
 *     corte          = cascata pelo maior desconto (ver ajuste-por-lastro.ts)
 *     nf_descontavel = desconto ideal − corte
 *     a lançar       = serviço medido + nf_descontavel
 *     % a lançar     = a lançar ÷ valor global do item
 *
 * O Informakon só desconta nota que está lançada lá. Liberar percentual que ele
 * não vai conseguir descontar entrega material à Wave sem contrapartida — então
 * o percentual cai exatamente no que falta de lastro, e nunca sobe por isso.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE A NOTA DA FIP NÃO ENTRA NO "A LANÇAR"
 *
 * Antes a fórmula era `serviço + desconto + FIP precisa emitir`, apostando que a
 * nota da FIP estaria emitida e lançada antes de o percentual ser digitado. Uma
 * aposta que a medição 5 desmentiu.
 *
 * Agora a nota da FIP não entra em percentual nenhum: ela é uma TAREFA da
 * camada ③. Quando for emitida e lançada no ERP, ela vira "Vlr. a Desc" e esta
 * camada a enxerga no retrato seguinte — subindo o percentual sozinha, sem
 * ninguém precisar prometer nada.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MACRO ITEM AUSENTE DO RETRATO
 *
 * Não é lastro zero. Sem número do outro lado não dá para afirmar que falta
 * alguma coisa, e chutar zero derrubaria o percentual do grupo inteiro. Fica
 * como está, e o painel avisa que aquele grupo não pôde ser conferido.
 */

import { chaveMacroItem } from './comparar-saldo'
import { ajustarGrupoPeloLastro, type ItemAjuste } from './ajuste-por-lastro'

/** O subconjunto de `InformaconLinha` que esta camada lê e escreve. */
export interface LinhaAjustavel {
  codigo: string
  wave_servico: number
  /** Entra como o desconto IDEAL (p × M) e sai já limitado pelo lastro. */
  nf_descontavel: number
  gap_material: number
  /** Valor global do item (qtd contratada × valor unitário) — base do %. */
  valor_total_item: number
  informakon_a_lancar?: number
  pct_informakon_a_lancar?: number
  correcao_informakon?: number
  dados_informakon: number
  /** Preenchido aqui: a parcela do desconto que o ERP não tem lastro para cobrir. */
  nf_nao_lancada_no_erp?: number
}

export interface ResumoRetratoAplicado {
  /** Total cortado do desconto por falta de lastro no ERP. */
  total: number
  porMacroItem: Array<{ chave: string; pedido: number; disponivel: number; falta: number }>
}

const cent = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * Muta as linhas aplicando o teto do ERP e rederiva o percentual de todas
 * elas — inclusive das intocadas, para que o boletim inteiro saia de uma
 * fórmula só.
 */
export function aplicarRetratoNasLinhas(
  linhas: LinhaAjustavel[],
  saldoPorChave: Map<string, number>,
): ResumoRetratoAplicado {
  const porChave = new Map<string, LinhaAjustavel[]>()
  for (const l of linhas) {
    const k = chaveMacroItem(l.codigo)
    if (!k) continue
    const lista = porChave.get(k)
    if (lista) lista.push(l)
    else porChave.set(k, [l])
  }

  const resumo: ResumoRetratoAplicado = { total: 0, porMacroItem: [] }

  for (const [chave, doGrupo] of porChave) {
    if (!saldoPorChave.has(chave)) continue

    const entrada: ItemAjuste[] = doGrupo.map((l, i) => ({
      id: String(i),
      totalMedido: num(l.wave_servico) + num(l.nf_descontavel),
      desconto: num(l.nf_descontavel),
    }))
    const r = ajustarGrupoPeloLastro(entrada, num(saldoPorChave.get(chave)))
    if (!(r.cortado > 0.005)) continue

    r.itens.forEach((ajustado, i) => {
      const linha = doGrupo[i]
      if (!(ajustado.cortado > 0)) return
      linha.nf_nao_lancada_no_erp = cent(num(linha.nf_nao_lancada_no_erp) + ajustado.cortado)
      linha.nf_descontavel = cent(num(linha.nf_descontavel) - ajustado.cortado)
      // Gap é "material medido sem desconto efetivo": cresce no mesmo valor.
      linha.gap_material = cent(num(linha.gap_material) + ajustado.cortado)
    })

    resumo.porMacroItem.push({
      chave,
      pedido: r.descontoIdeal,
      disponivel: r.lastro,
      falta: r.cortado,
    })
    resumo.total = cent(resumo.total + r.cortado)
  }

  for (const l of linhas) {
    // A nota da FIP NÃO entra: ver o bloco no topo do arquivo.
    const aLancar = cent(num(l.wave_servico) + num(l.nf_descontavel))
    l.informakon_a_lancar = aLancar
    l.pct_informakon_a_lancar = num(l.valor_total_item) > 0
      ? (aLancar / num(l.valor_total_item)) * 100
      : 0
    l.correcao_informakon = cent(num(l.dados_informakon) - aLancar)
    if (l.nf_nao_lancada_no_erp === undefined) l.nf_nao_lancada_no_erp = 0
  }

  resumo.porMacroItem.sort((a, b) => b.falta - a.falta)
  return resumo
}
