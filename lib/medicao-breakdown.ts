/**
 * Modelo unico de "medicao por celula" (breakdown) de um detalhamento.
 *
 * Hoje existem dois formatos de breakdown, ambos gravados na mesma coluna
 * `medicao_itens.pavimentos_pct` (migration 066), indexada a partir de 1:
 *
 *   - PAV TIPO  ("... PAV TIPO ( 1o AO 36o PAV )")  -> por pavto
 *   - Grade binaria (vaos nomeados, parcelas mensais) -> por vao / por mes
 *
 * O LANCAMENTO (tela de Nova Medicao) mantem as escalas restritas de cada um
 * — 0/25/50/75/100 no PAV TIPO, 0/100 na grade binaria. O AJUSTE DO ADMIN,
 * que e o que este modulo governa, aceita qualquer inteiro de 0 a 100 em
 * QUALQUER celula dos dois formatos: uma correcao de campo nao cabe numa
 * escala de quartos ("o vao esta 83% executado, nao 75% nem 100%"). Os pcts
 * de `pctsPermitidos` sao so os atalhos de botao — o input de % livre ao lado
 * cobre o resto.
 *
 * `lib/pavimentos.ts` e `lib/grade-binaria.ts` detectam cada um separadamente.
 * Este modulo unifica os dois atras de uma unica interface pra que a tela de
 * Nova Medicao, a tela de detalhe da medicao (ajuste do admin) e a rota
 * PATCH .../ajustar apliquem EXATAMENTE as mesmas regras — em especial o
 * "piso" por celula, que e a diferenca entre corrigir um pavto pra menos
 * (permitido dentro desta medicao) e desmedir trabalho ja aprovado (proibido).
 *
 * Regra central (piso por celula):
 *   pavimentos_pct guarda o pct ACUMULADO ao fim da medicao. Logo o pct de
 *   uma celula nesta medicao nunca pode ficar ABAIXO do maior pct que essa
 *   mesma celula ja atingiu em medicoes aprovadas anteriores. Acima desse
 *   piso o admin pode subir OU DESCER a vontade — e esse "descer" que a tela
 *   de Nova Medicao nao oferece (la o valor so cresce) e que o ajuste do
 *   admin precisa oferecer: um pavto medido a 90% NESTA medicao pode ser
 *   corrigido pra 50%, desde que 50% >= o acumulado aprovado anterior.
 */

import {
  detectarPavRange,
  listarPavimentos,
  normalizarPct,
  somarPavimentos,
  PAV_PCTS,
  type PavRange,
} from './pavimentos'
import { detectarGradeBinaria, type GradeBinaria } from './grade-binaria'
import { nomeVao } from './vaos'

/** Uma celula do breakdown (um pavto, um vao ou um mes). */
export interface BreakdownCelula {
  /** Numero 1-based — tambem a chave em `pavimentos_pct` (como string). */
  num: number
  /** Chave literal usada no JSONB. */
  chave: string
  /** Rotulo pra UI: "12º pav", "14T", "Mês 3". */
  label: string
}

export interface BreakdownModo {
  /** 'pavimento' = escala 0/25/50/75/100. 'grade' = binario 0/100. */
  tipo: 'pavimento' | 'grade'
  /**
   * true quando o LANCAMENTO daquele item e binario (vaos, parcelas mensais).
   * No ajuste do admin isso e apenas uma dica de layout e de rotulo — a
   * escala de valores e livre nos dois modos.
   */
  binaria: boolean
  /** Singular pra UI: "pavimento", "vão", "mês". */
  termo: string
  /** Plural pra UI: "pavimentos", "vãos", "meses". */
  termoPlural: string
  /** Pcts oferecidos como botao. Binaria: [0, 100]. */
  pctsPermitidos: number[]
  /** Todas as celulas, em ordem. length === round(quantidade_contratada). */
  celulas: BreakdownCelula[]
  /** Presente so quando tipo === 'pavimento'. */
  range?: PavRange
  /** Presente so quando tipo === 'grade'. */
  grade?: GradeBinaria
}

/**
 * Detecta o modo de breakdown de um detalhamento a partir da descricao +
 * quantidade contratada. Retorna null pra itens convencionais (input numerico
 * ou botoes de % no item inteiro).
 *
 * IMPORTANTE: a deteccao usa SO descricao + quantidade_contratada, nunca a
 * presenca de `pavimentos_pct`. Um item PAV TIPO medido no formato antigo
 * (input numerico, sem breakdown gravado) continua sendo um item de
 * breakdown — e justamente o caso que o admin precisa poder corrigir.
 */
export function detectarBreakdown(
  descricao: string | null | undefined,
  qtdeContratada: number,
): BreakdownModo | null {
  const range = detectarPavRange(descricao, qtdeContratada)
  if (range) {
    return {
      tipo: 'pavimento',
      binaria: false,
      termo: 'pavimento',
      termoPlural: 'pavimentos',
      pctsPermitidos: [...PAV_PCTS],
      celulas: listarPavimentos(range).map(num => ({
        num,
        chave: String(num),
        label: `${num}º pav`,
      })),
      range,
    }
  }

  const grade = detectarGradeBinaria(descricao, qtdeContratada)
  if (grade) {
    return {
      tipo: 'grade',
      binaria: true,
      termo: grade.termo,
      termoPlural: grade.termoPlural,
      // Atalhos de botao. A grade binaria ganha os mesmos quartos do PAV TIPO
      // porque o ajuste do admin nao e binario — 0/100 sozinhos obrigariam a
      // digitar todo valor intermediario no input livre.
      pctsPermitidos: [0, 25, 50, 75, 100],
      celulas: grade.nomes.map((_, i) => ({
        num: i + 1,
        chave: String(i + 1),
        label: nomeVao(grade.nomes, i + 1),
      })),
      grade,
    }
  }

  return null
}

/** Le o pct de uma celula num mapa `pavimentos_pct`, tolerando lixo. */
export function lerPct(
  mapa: Record<string, number> | null | undefined,
  chave: string,
): number {
  if (!mapa) return 0
  const v = Number(mapa[chave])
  return Number.isFinite(v) && v > 0 ? v : 0
}

/**
 * Aplica as regras de uma celula no ajuste do admin:
 * qualquer inteiro de 0 a 100, nunca abaixo do piso do acumulado aprovado.
 *
 * A escala e livre nos DOIS modos, grade binaria inclusive: quem ajusta esta
 * corrigindo o que foi medido em campo, e 83% e um numero legitimo. Quantizar
 * em 0/100 (ou em quartos) so obrigaria o admin a mentir pra caber na escala.
 * `modo` fica na assinatura porque a chamada e sempre feita no contexto de um
 * breakdown e a validacao de chave depende dele.
 */
export function clampPctCelula(
  _modo: BreakdownModo,
  pctRaw: number,
  pctAnterior: number,
): number {
  const piso = clampPct(pctAnterior)
  const pct = Number(pctRaw)
  if (!Number.isFinite(pct)) return piso
  const v = clampPct(pct)
  return v < piso ? piso : v
}

/** Inteiro 0..100, tolerando lixo. */
function clampPct(n: number): number {
  const v = Math.round(Number(n) || 0)
  if (v < 0) return 0
  if (v > 100) return 100
  return v
}

/**
 * Normaliza um pct pro atalho mais proximo da escala do modo, sem aplicar
 * piso. NAO e usado no caminho de gravacao — so onde a UI precisa sugerir um
 * dos botoes. `normalizarPct` (lib/pavimentos) segue sendo a escala de
 * quartos do LANCAMENTO.
 */
export function normalizarPctModo(_modo: BreakdownModo, pctRaw: number): number {
  return normalizarPct(Number(pctRaw) || 0)
}

/** Arredonda quantidade pra 6 casas — o mesmo NUMERIC(15,6) da coluna. */
export function arredondarQtde(n: number): number {
  return Math.round((Number(n) || 0) * 1e6) / 1e6
}

export interface CelulaAlterada {
  chave: string
  label: string
  de: number
  para: number
  /** Piso vindo de medicoes aprovadas anteriores. */
  anterior: number
}

export interface BreakdownNormalizado {
  /** Mapa final a gravar em `pavimentos_pct` (so celulas com pct > 0). */
  mapa: Record<string, number>
  /** Soma dos pcts / 100 = quantidade ACUMULADA ao fim desta medicao. */
  somaAcumulada: number
  /** Celulas cujo pct mudou em relacao ao mapa atual da medicao. */
  alteradas: CelulaAlterada[]
  /** Celulas cujo valor pedido foi elevado ate o piso do acumulado anterior. */
  elevadasAoPiso: CelulaAlterada[]
  /** Chaves do payload que nao pertencem ao range do item (ignoradas). */
  chavesIgnoradas: string[]
}

/**
 * Reconstroi o mapa `pavimentos_pct` completo de uma medicao a partir de um
 * mapa pedido, aplicando escala + piso celula a celula.
 *
 * - `pedido`   mapa vindo da UI (pode ser parcial — celulas ausentes caem em
 *              `atual`, ou no piso quando nem isso existe)
 * - `atual`    `pavimentos_pct` gravado hoje nesta medicao (pra diff)
 * - `anterior` MAX por celula entre as medicoes APROVADAS anteriores = piso
 *
 * O retorno cobre TODAS as celulas do modo — nunca so as tocadas — pra que o
 * JSONB gravado seja um retrato completo do acumulado ao fim da medicao.
 */
export function normalizarBreakdown(args: {
  modo: BreakdownModo
  pedido: Record<string, number> | null | undefined
  atual: Record<string, number> | null | undefined
  anterior: Record<string, number> | null | undefined
}): BreakdownNormalizado {
  const { modo, pedido, atual, anterior } = args
  const validas = new Set(modo.celulas.map(c => c.chave))

  const mapa: Record<string, number> = {}
  const alteradas: CelulaAlterada[] = []
  const elevadasAoPiso: CelulaAlterada[] = []

  for (const celula of modo.celulas) {
    const piso = lerPct(anterior, celula.chave)
    const atualPct = Math.max(lerPct(atual, celula.chave), piso)
    const temPedido = !!pedido && pedido[celula.chave] !== undefined && pedido[celula.chave] !== null
    const pedidoPct = temPedido ? Number(pedido![celula.chave]) : atualPct

    const finalPct = clampPctCelula(modo, pedidoPct, piso)
    if (finalPct > 0) mapa[celula.chave] = finalPct

    if (finalPct !== atualPct) {
      alteradas.push({ chave: celula.chave, label: celula.label, de: atualPct, para: finalPct, anterior: piso })
    }
    if (temPedido && Number.isFinite(pedidoPct) && clampPct(pedidoPct) < piso) {
      elevadasAoPiso.push({ chave: celula.chave, label: celula.label, de: Math.round(pedidoPct), para: finalPct, anterior: piso })
    }
  }

  const chavesIgnoradas = Object.keys(pedido || {}).filter(k => !validas.has(k))

  return {
    mapa,
    somaAcumulada: arredondarQtde(somarPavimentos(mapa)),
    alteradas,
    elevadasAoPiso,
    chavesIgnoradas,
  }
}

/**
 * Delta desta medicao a partir do acumulado do breakdown.
 *
 * `quantidade_medida` e o DELTA do periodo (compat com 3-way match, retencao,
 * NFs, INFORMAKON). O acumulado anterior usado aqui e a SOMA REAL de
 * `quantidade_medida` das medicoes aprovadas anteriores — nao a soma do
 * breakdown anterior — porque medicoes antigas podem ter sido submetidas sem
 * breakdown (input numerico). E a mesma conta da tela de Nova Medicao.
 */
export function calcularDeltaBreakdown(somaAcumulada: number, qtdAnteriorReal: number): number {
  return arredondarQtde(somaAcumulada - (Number(qtdAnteriorReal) || 0))
}

/**
 * Distribui uma quantidade acumulada em celulas cheias + um resto parcial.
 *
 * Usado pelo backfill de historico: um item com 5,83 un acumuladas vira
 * 5 celulas a 100% e a sexta a 83%. Arredondar pra 6 celulas cheias (o que o
 * seed antigo fazia) inflava o breakdown em 0,17 un — e como o breakdown vira
 * o piso da proxima medicao, essa fracao entrava como quantidade medida do
 * nada. Nunca ultrapassa `totalCelulas`.
 */
export function distribuirAcumuladoEmCelulas(
  qtdeAcumulada: number,
  totalCelulas: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!(totalCelulas > 0)) return out
  const total = Math.min(Math.max(Number(qtdeAcumulada) || 0, 0), totalCelulas)
  // +1e-9 absorve o residuo de float de somas como 0.83 + 0.17.
  const cheias = Math.min(Math.floor(total + 1e-9), totalCelulas)
  const resto = Math.max(0, Math.min(100, Math.round((total - cheias) * 100)))
  for (let i = 1; i <= totalCelulas; i++) {
    const pct = i <= cheias ? 100 : i === cheias + 1 ? resto : 0
    if (pct > 0) out[String(i)] = pct
  }
  return out
}

export { somarPavimentos }
