// lib/relatorios/material-sem-nf.ts
// Relatório "Material medido sem NF" — candidato a NF de material da FIP.
//
// A camada ③ do boletim só pergunta "a FIP precisa emitir?" sobre o material
// AINDA NÃO DESCONTADO. Material que a Wave já teve descontado — porque o
// Informakon tinha nota sobrando no macro item, ou porque a medição é anterior
// à regra (27/08/2026) — sai da conta, mesmo sem NF de ninguém no item
// (2.2.1, 2.3.1 e 2.7.1 na análise de 29/10/2026). Este relatório olha o
// material instalado contra o material comprado, item a item:
//
//     sem NF = material medido (aprovado) − max(NF lançada, pedido aprovado)
//
// `max` e não soma: o pedido aprovado já contém o que dele virou nota.
//
// A sobra de outros itens do mesmo macro item aparece ao lado, sem abater
// automaticamente: ela só cobre o item se o material faturado lá for o mesmo
// que foi instalado aqui (rateio errado do pedido) — e isso é conferência de
// obra, não conta.
import { chaveMacroItem } from '@/lib/informakon/comparar-saldo'

export interface FornecedorDoItem {
  fornecedor: string
  /** Pedido aprovado (menos devolução) alocado no item. */
  pedido: number
  /** NF lançada (não cancelada), rateada pelo peso do item no pedido. */
  nf: number
}

export interface ItemMaterialEntrada {
  id: string
  codigo: string
  nome: string
  materialContratado: number
  /** Σ quantidade × material unit. das medições aprovadas. */
  materialMedido: number
  /** Material já descontado da Wave (mesma régua da camada ①). */
  materialDescontado: number
  fornecedores: FornecedorDoItem[]
}

export interface LinhaMaterialSemNf extends ItemMaterialEntrada {
  nf: number
  pedido: number
  /** max(NF, pedido): o material que já tem quem faturou ou vai faturar. */
  comprado: number
  /** Material medido sem NF nem pedido no item. */
  semNf: number
  /**
   * NF lançada além do medido: material entregue e ainda não instalado, ou
   * NF rateada no item errado. Pedido sem NF não entra — é compra futura
   * (o gerador 2.1.1, ainda não medido, não cobre os painéis do 2.2.1).
   */
  sobra: number
}

export interface GrupoMaterialSemNf {
  balde: string
  nome: string
  semNf: number
  /** Σ NF além do medido nos itens do macro item. */
  sobra: number
  /** Parte do sem NF que nem a sobra do macro item cobre. */
  descoberto: number
  /** Só os itens com sem NF > 0. */
  itens: LinhaMaterialSemNf[]
  /** Itens com sobra, para conferir rateio. */
  itensComSobra: LinhaMaterialSemNf[]
}

export interface RelatorioMaterialSemNf {
  grupos: GrupoMaterialSemNf[]
  totalSemNf: number
  totalDescoberto: number
  qtdItens: number
}

const cent = (n: number) => Math.round((n || 0) * 100) / 100 + 0
const TOL = 0.5

export function linhaMaterialSemNf(it: ItemMaterialEntrada): LinhaMaterialSemNf {
  const nf = it.fornecedores.reduce((s, f) => s + f.nf, 0)
  const pedido = it.fornecedores.reduce((s, f) => s + f.pedido, 0)
  const comprado = Math.max(nf, pedido)
  return {
    ...it,
    nf: cent(nf),
    pedido: cent(pedido),
    comprado: cent(comprado),
    semNf: cent(Math.max(0, it.materialMedido - comprado)),
    sobra: cent(Math.max(0, nf - it.materialMedido)),
  }
}

export function montarRelatorioMaterialSemNf(
  itens: ItemMaterialEntrada[],
  nomeDoBalde: (balde: string) => string,
): RelatorioMaterialSemNf {
  const porBalde = new Map<string, LinhaMaterialSemNf[]>()
  for (const it of itens) {
    if (!(it.materialContratado > 0)) continue
    const balde = chaveMacroItem(it.codigo)
    const lista = porBalde.get(balde)
    const linha = linhaMaterialSemNf(it)
    if (lista) lista.push(linha)
    else porBalde.set(balde, [linha])
  }

  const grupos: GrupoMaterialSemNf[] = []
  for (const [balde, linhas] of porBalde) {
    const comFalta = linhas.filter(l => l.semNf > TOL)
    if (comFalta.length === 0) continue
    const semNf = cent(comFalta.reduce((s, l) => s + l.semNf, 0))
    const sobra = cent(linhas.reduce((s, l) => s + l.sobra, 0))
    grupos.push({
      balde,
      nome: nomeDoBalde(balde),
      semNf,
      sobra,
      descoberto: cent(Math.max(0, semNf - sobra)),
      itens: comFalta,
      itensComSobra: linhas.filter(l => l.sobra > TOL),
    })
  }
  grupos.sort((a, b) => b.semNf - a.semNf)

  return {
    grupos,
    totalSemNf: cent(grupos.reduce((s, g) => s + g.semNf, 0)),
    totalDescoberto: cent(grupos.reduce((s, g) => s + g.descoberto, 0)),
    qtdItens: grupos.reduce((s, g) => s + g.itens.length, 0),
  }
}
