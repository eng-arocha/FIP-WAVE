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
 * ─────────────────────────────────────────────────────────────────────────
 * A NOTA DA FIP NÃO PASSA POR AQUI (29/10/2026)
 *
 * Até 29/10 esta camada mexia na FIP de dois jeitos: abatia o desconto
 * lastreado (`fip − nf_descontavel`) e somava um piso por grupo (corte − nota
 * a caminho). Os dois compensavam no nível do macro item — nota do vizinho
 * zerava a FIP de um item sem nota, e o piso jogou R$ 153 mil no 1.3.1 acima
 * do contratado na MED-007. A camada ③ agora é item a item, contra o material
 * instalado e as compras do site (lib/db/desconto-material.ts), e o retrato
 * do ERP não altera `fip_faturar`. Nota que o Informakon tem e o site não tem
 * se resolve lançando a nota no site.
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
  /** Camada ③: quanto a FIP precisa emitir. Esta camada não o altera. */
  fip_faturar?: number
  /** Camada ③: material com pedido aprovado esperando a nota do fornecedor. */
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
}

export interface OpcoesRetrato {
  /**
   * Regra do "% real" (migration 086, spec 2026-10-28): o percentual a lançar
   * é o FÍSICO — serviço + material do período —, e o corte por falta de
   * lastro deixa de baixar o percentual. O material sem lastro fica como
   * desconto pendente do item (camada ①) e é descontado, sem %, na medição em
   * que a nota entrar no Informakon. É como o Informakon opera (MED-007: o
   * 1.3.1 foi lançado a 100% sem as notas da MSF/Cordeiro).
   *
   * Sem a regra, o lançado é `serviço + desconto` — medições aprovadas antes
   * dela continuam reimpressas como foram assinadas.
   */
  pctReal?: boolean
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
  opcoes: OpcoesRetrato = {},
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
    // A nota da FIP NÃO entra no percentual: ver o bloco no topo do arquivo.
    const bruto = baseALancar(l, opcoes.pctReal === true)
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


/**
 * Quanto do desconto da linha é material de medições ANTERIORES que voltou
 * agora — o corte de um mês sem lastro que o Informakon passou a cobrir.
 *
 * Não precisa de registro próprio: a camada ① já carrega o corte (o desconto
 * ideal é o material acumulado menos o já lançado nas aprovadas), e a camada ②
 * corta a recuperação antes do mês corrente. Então, depois do teto, o que o
 * desconto tem além do material do período é recuperação que passou.
 *
 * Decisão do usuário (27/10/2026), MED-007: os R$ 31.916,58 da MSF/Cordeiro
 * cortados no 1.3.1 voltam sozinhos quando as notas entrarem — e o boletim
 * precisa mostrar isso em destaque, para não parecer % acima do mês.
 */
export function recuperadoDeMedicoesAnteriores(l: { nf_descontavel: number; material_medido?: number }): number {
  if (l.material_medido === undefined) return 0
  const r = cent(num(l.nf_descontavel) - num(l.material_medido))
  return r > 0.01 ? r : 0
}


/**
 * O valor contratual que o item lança no Informakon.
 *
 *     regra antiga:  serviço + desconto (o corte baixa o percentual)
 *     % real:        serviço + material do período (o físico)
 *
 * No % real, o desconto que passa do material do período (pendente antigo que
 * ganhou lastro) não sobe o percentual, e o que falta de lastro não o baixa:
 * os dois ficam só no "material a descontar".
 */
export function baseALancar(
  l: Pick<LinhaAjustavel, 'wave_servico' | 'nf_descontavel' | 'material_medido'>,
  pctReal: boolean,
): number {
  if (pctReal && l.material_medido !== undefined) {
    return num(l.wave_servico) + num(l.material_medido)
  }
  return num(l.wave_servico) + num(l.nf_descontavel)
}
