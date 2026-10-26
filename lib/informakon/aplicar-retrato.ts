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
  /**
   * Camada ③: material com pedido aprovado esperando a nota do fornecedor.
   * Ausente = desconhecido, e aí o piso da FIP pelo corte não é aplicado.
   */
  faturamento_direto_em_aberto?: number
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
  /** Quanto entrou em "FIP precisa emitir" pelo corte sem nota a caminho. */
  fipPeloCorte: number
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

  const resumo: ResumoRetratoAplicado = { total: 0, porMacroItem: [], fipAbatidoPeloLastro: 0, fipPeloCorte: 0 }

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
  // ── O PISO DA FIP: o corte que nenhuma nota a caminho cobre ───────────
  //
  //     FIP do grupo ≥ corte do grupo − nota a caminho do grupo
  //
  // Decisão do usuário (26/10/2026), MED-007: "não tem lastro e só tem nota a
  // caminho — a FIP deveria lançar a diferença". O abatimento acima só olha
  // para baixo (`fip − nf_descontavel`) e, quando o site conta como cobertura
  // uma nota que o ERP lançou em outro macro item, zera a FIP com R$ 185 mil
  // cortados e R$ 32 mil a caminho. O corte é o que o ERP NÃO tem; se nenhum
  // pedido aprovado vai trazer a nota, ninguém mais fatura esse material.
  //
  // Pedido da FIP já autorizado e sem nota conta como "a caminho", então a
  // nota autorizada não volta como emissão nova. Grupo com nota a caminho
  // desconhecida (linha sem o campo) fica como estava.
  for (const [chave, doGrupo] of porChave) {
    if (!saldoPorChave.has(chave)) continue
    if (doGrupo.some(l => l.faturamento_direto_em_aberto === undefined)) continue
    const corte = doGrupo.reduce((t, l) => t + num(l.nf_nao_lancada_no_erp), 0)
    if (!(corte > 0.005)) continue
    const aCaminho = doGrupo.reduce((t, l) => t + num(l.faturamento_direto_em_aberto), 0)
    const jaPedido = doGrupo.reduce((t, l) => t + num(l.fip_faturar), 0)
    const extra = cent(corte - aCaminho - jaPedido)
    if (!(extra > 0.005)) continue
    for (const l of doGrupo) {
      const parte = extra * (num(l.nf_nao_lancada_no_erp) / corte)
      if (parte > 0) l.fip_faturar = cent(num(l.fip_faturar) + parte)
    }
    resumo.fipPeloCorte = cent(resumo.fipPeloCorte + extra)
  }

  return resumo
}

/**
 * Lastro EM LANÇAMENTO: o pedido de NF de material da FIP autorizado no
 * portão 1 e ainda sem nota.
 *
 * Decisão do usuário (26/10/2026), MED-007: o "% a lançar" já deve sair
 * correto considerando a NF de material da FIP, com um aviso. É seguro só
 * para a FIP: o portão 2 exige a NF de material lançada antes de liberar a
 * NF de serviço, então essa nota está no Informakon quando a medição é
 * digitada lá. Nota de fornecedor a caminho não tem essa trava e continua
 * fora do lastro — foi a aposta que a Medição 5 desmentiu.
 *
 * Soma por macro item (a mesma chave da camada ②) a partir do pendente por
 * detalhamento. Detalhamento sem código conhecido é ignorado.
 */
export function lastroFipEmLancamento(
  fipPendentePorDet: Record<string, number>,
  codigoPorDet: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [detId, valor] of Object.entries(fipPendentePorDet)) {
    const chave = chaveMacroItem(codigoPorDet.get(detId))
    if (!chave || !(num(valor) > 0.005)) continue
    out.set(chave, cent((out.get(chave) || 0) + num(valor)))
  }
  return out
}

