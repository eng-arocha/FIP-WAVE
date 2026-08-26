/**
 * Aplica o retrato do Informakon ao boletim: o que NÃO está lançado no ERP
 * não pode ser liberado no percentual.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O PROBLEMA
 *
 * A coluna "% a lançar" é calculada assim:
 *
 *     a lançar = Serviço Wave + NF Desc. + FIP precisa emitir
 *
 * e assume que TODO o "NF Desc." já está lançado no Informakon no momento em
 * que o percentual é digitado. É uma pré-condição, não um fato. Quando ela
 * falha — a nota existe aqui e não existe lá — o ERP libera o valor cheio e
 * desconta só o que tem:
 *
 *     Wave recebe = a lançar − (lançado lá) = Serviço + (NF Desc. − lançado)
 *
 * ou seja, a Wave recebe a diferença a mais.
 *
 * E não se corrige sozinho no mês seguinte. Na aprovação, o boletim grava
 * `nf_descontavel` em `medicao_itens.nf_material_descontada` (migration 074),
 * que é o saldo corrido de "esta nota já foi abatida". Registrar um abatimento
 * que o ERP não fez faz a nota sumir da fila para sempre: não é adiantamento,
 * é vazamento.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A CORREÇÃO
 *
 * Reclassificar a parcela não lançada de NF Desc. para uma terceira categoria
 * de Gap, ao lado das duas que já existiam:
 *
 *     Gap = Nota a caminho          (a nota ainda não existe)
 *         + FIP precisa emitir      (material sem pedido)
 *         + Não lançada no ERP      ← esta, nova
 *
 * O mesmo movimento resolve as duas pontas de uma vez: sai de
 * `informakon_a_lancar` (o percentual cai exatamente na diferença, e o ERP
 * não paga o que não vai descontar) e sai de `nf_descontavel` (a aprovação
 * não marca a nota como abatida, então ela volta na medição seguinte).
 *
 * Categoria separada, e não somada em "Nota a caminho", porque as duas
 * exigem ações opostas: "Nota a caminho" espera o fornecedor; "Não lançada
 * no ERP" é uma nota que já está na nossa mão e só precisa ser digitada lá.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * GRANULARIDADE
 *
 * O retrato é por macro item; o boletim mede por detalhamento. A falta é
 * apurada no macro item (é onde os dois lados têm número) e rateada entre os
 * detalhamentos na proporção do que cada um pede de desconto — o mesmo
 * critério com que o desconto foi distribuído dentro do balde.
 */

import { chaveMacroItem } from './comparar-saldo'

/** O subconjunto de `InformaconLinha` que este ajuste lê e escreve. */
export interface LinhaAjustavel {
  codigo: string
  wave_servico: number
  nf_descontavel: number
  gap_material: number
  fip_faturar: number
  faturamento_direto_em_aberto: number
  dados_informakon: number
  /** Valor global do item (qtd contratada × valor unitário) — base do %. */
  valor_total_item: number
  informakon_a_lancar?: number
  pct_informakon_a_lancar?: number
  correcao_informakon?: number
  /** Preenchido por esta função: parcela do desconto que o ERP não tem. */
  nf_nao_lancada_no_erp?: number
}

export interface ResumoRetratoAplicado {
  /** Total reclassificado de NF Desc. para "não lançada no ERP". */
  total: number
  /** Por macro item: quanto o boletim pedia, quanto existe lá, e a falta. */
  porMacroItem: Array<{ chave: string; pedido: number; disponivel: number; falta: number }>
}

const cent = (n: number) => Math.round(n * 100) / 100
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0)

/**
 * Rateia `falta` entre as linhas na proporção de `nf_descontavel`.
 *
 * O resto do arredondamento vai para a MAIOR linha, senão a soma das partes
 * não fecha com o total e o boletim passa a mentir por centavos — que é
 * exatamente o tipo de erro que este módulo existe para impedir.
 */
function ratear(linhas: LinhaAjustavel[], falta: number): Map<LinhaAjustavel, number> {
  const out = new Map<LinhaAjustavel, number>()
  const base = linhas.reduce((s, l) => s + num(l.nf_descontavel), 0)
  if (!(falta > 0) || !(base > 0)) return out

  let distribuido = 0
  let maior: LinhaAjustavel | null = null
  for (const l of linhas) {
    const pedido = num(l.nf_descontavel)
    if (pedido <= 0) continue
    const parte = cent(Math.min(pedido, (falta * pedido) / base))
    out.set(l, parte)
    distribuido = cent(distribuido + parte)
    if (!maior || pedido > num(maior.nf_descontavel)) maior = l
  }

  const resto = cent(falta - distribuido)
  if (resto !== 0 && maior) {
    // Nunca reclassificar mais do que a linha pede de desconto.
    const teto = num(maior.nf_descontavel)
    out.set(maior, Math.min(teto, cent((out.get(maior) ?? 0) + resto)))
  }
  return out
}

/**
 * Muta as linhas aplicando o retrato. Devolve o resumo do que foi
 * reclassificado — é o que a UI mostra para o usuário entender a queda do %.
 *
 * `saldoPorChave` é o "Vlr. a Desc" do retrato por macro item. Macro item
 * ausente do retrato NÃO é tratado como zero: sem número do outro lado não dá
 * para afirmar que falta alguma coisa, e chutar zero derrubaria o percentual
 * do grupo inteiro. Fica como está.
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
    const pedido = cent(doGrupo.reduce((s, l) => s + num(l.nf_descontavel), 0))
    const disponivel = cent(num(saldoPorChave.get(chave)))
    const falta = cent(pedido - disponivel)
    if (!(falta > 0.01)) continue

    const partes = ratear(doGrupo, falta)
    let aplicado = 0
    for (const [linha, parte] of partes) {
      if (!(parte > 0)) continue
      linha.nf_nao_lancada_no_erp = cent(num(linha.nf_nao_lancada_no_erp) + parte)
      linha.nf_descontavel = cent(num(linha.nf_descontavel) - parte)
      // Gap é "material medido sem desconto efetivo": cresce no mesmo valor.
      // `fip_faturar` e "Nota a caminho" NÃO mudam — a parcela nova é a
      // terceira categoria, e misturá-la em qualquer uma das duas mandaria o
      // usuário fazer a coisa errada (emitir nota que já existe, ou esperar
      // um fornecedor que já entregou).
      linha.gap_material = cent(num(linha.gap_material) + parte)
      aplicado = cent(aplicado + parte)
    }

    resumo.porMacroItem.push({ chave, pedido, disponivel, falta: aplicado })
    resumo.total = cent(resumo.total + aplicado)
  }

  // Recalcula o que depende de `nf_descontavel` — inclusive nas linhas
  // intocadas, para que o boletim inteiro saia de uma fórmula só.
  for (const l of linhas) {
    const aLancar = cent(num(l.wave_servico) + num(l.nf_descontavel) + num(l.fip_faturar))
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
