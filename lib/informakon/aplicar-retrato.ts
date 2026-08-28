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
 *
 * Pela mesma razão, ausência também não é COBERTURA: o abatimento da nota da
 * FIP abaixo só vale para grupo presente no retrato. Ler `nf_descontavel`
 * intocado como "tem lastro para tudo" transformaria falta de informação em
 * prova de que o material já foi faturado.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A NOTA DA FIP DEPOIS DO CORTE
 *
 * A camada ③ mede cobertura pelo SITE — nota de terceiro cadastrada mais
 * pedido aprovado. Só que o desconto que sai daqui é, por construção, nota
 * que o ERP TEM lançada: ele não abate o que não está lá. Onde o Informakon
 * tem nota que o nosso cadastro não tem, a camada ③ conclui que ninguém
 * comprou o material e manda a FIP emitir — uma segunda nota para o mesmo
 * material.
 *
 * O estrago não é imediato, e é por isso que passa despercebido: o desconto é
 * limitado ao material que falta descontar, então a nota extra não abate hoje.
 * Ela fica como lastro parado no ERP e, meses depois, cobre material real de
 * outro item — material descontado contra uma nota que não corresponde a
 * compra nenhuma. A Wave perde esse valor, com atraso e sem rastro.
 *
 * Então, depois do corte:
 *
 *     fip_faturar = max( 0 , fip_faturar − nf_descontavel )
 *
 * Em uma frase: do que a camada ③ ia mandar emitir, desconte o que o ERP já
 * tem lançado. O que sobra é material sem nota em lugar nenhum.
 *
 * A primeira versão disto usava `min(fip_faturar, corte)`, que trata as duas
 * coberturas como sobrepostas — a mesma nota contada dos dois lados. A
 * autorização do pedido da FIP provou que elas são DISJUNTAS: no 18.1.6 o
 * usuário autorizou os R$ 9.902,38 que faltavam, isso virou pedido aprovado no
 * site, e o `min` devolveu R$ 1.154,88 "ainda a emitir" — justamente a parte
 * que já tinha lastro no ERP. Autorizar de novo emitiria nota em duplicidade,
 * e o ciclo só terminaria depois de emitir R$ 11.057,26 onde bastavam
 * R$ 9.902,38.
 *
 * A subtração assume cobertura disjunta e pode, no caso oposto (nota nossa que
 * é a MESMA nota do ERP), pedir de menos. É o erro que se prefere: pedir de
 * menos volta sozinho no mês seguinte pelo pendente de lastro; pedir de mais
 * cria uma segunda nota para o mesmo material, que não volta de lugar nenhum.
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
  /** O desconto ANTES do teto — base do abatimento da nota da FIP. */
  desconto_ideal?: number
  /** `p × M` do PERÍODO. O que excede isso no ideal é material de meses anteriores. */
  material_medido?: number
  /** Camada ③: quanto a FIP precisa emitir. Reduzido aqui pelo lastro do ERP. */
  fip_faturar?: number
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
  /** Quanto saiu de "FIP precisa emitir" por já haver nota lançada no ERP. */
  fipAbatidoPeloLastro: number
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

  const resumo: ResumoRetratoAplicado = { total: 0, porMacroItem: [], fipAbatidoPeloLastro: 0 }

  for (const [chave, doGrupo] of porChave) {
    // Grupo fora do retrato não é conferido — nem para cortar, nem para
    // abater a nota da FIP.
    if (!saldoPorChave.has(chave)) continue

    const entrada: ItemAjuste[] = doGrupo.map((l, i) => ({
      id: String(i),
      totalMedido: num(l.wave_servico) + num(l.nf_descontavel),
      desconto: num(l.nf_descontavel),
      // O que o desconto tem além do material do período é recuperação de
      // meses anteriores, e ela cede o lastro primeiro: sem isso o material
      // velho passava inteiro e o do mês corrente é que era cortado.
      pendente: l.material_medido === undefined
        ? 0
        : Math.max(0, num(l.nf_descontavel) - num(l.material_medido)),
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
    // ── CAMADA ③ revisitada, agora que o corte é conhecido ───────────────
    //
    //     fip_faturar = max( 0 , fip_faturar − nf_descontavel )
    //
    // Só para grupo presente no retrato: ver "MACRO ITEM AUSENTE" no topo.
    if (l.fip_faturar !== undefined && saldoPorChave.has(chaveMacroItem(l.codigo))) {
      const antes = num(l.fip_faturar)
      const depois = Math.max(0, cent(antes - num(l.nf_descontavel)))
      if (depois < antes) {
        resumo.fipAbatidoPeloLastro = cent(resumo.fipAbatidoPeloLastro + (antes - depois))
      }
      l.fip_faturar = cent(depois)
    }

    // A nota da FIP NÃO entra no percentual: ver o bloco no topo do arquivo.
    const bruto = num(l.wave_servico) + num(l.nf_descontavel)
    const aLancar = cent(bruto)
    l.informakon_a_lancar = aLancar
    // O percentual sai do valor SEM arredondar. Arredondar antes de dividir
    // empurra o resultado meio centavo para cima, e um item sai com 25,0001%
    // contra 25,0000% de físico — percentual acima do executado por artefato
    // de exibição. O valor em reais continua em centavos, que é o que se digita.
    l.pct_informakon_a_lancar = num(l.valor_total_item) > 0
      ? (bruto / num(l.valor_total_item)) * 100
      : 0
    l.correcao_informakon = cent(num(l.dados_informakon) - aLancar)
    if (l.nf_nao_lancada_no_erp === undefined) l.nf_nao_lancada_no_erp = 0
  }

  resumo.porMacroItem.sort((a, b) => b.falta - a.falta)
  return resumo
}
