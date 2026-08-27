import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularInformaconData } from '@/lib/db/informacon-data'
import { carregarAlocacaoDeNotas, carregarDatasDeNotas } from '@/lib/db/alocacao-notas'
import { chaveMacroItem } from '@/lib/informakon/comparar-saldo'
import { normalizarNumeroNota } from '@/lib/informakon/conferir-notas'
import { rechavearRetrato } from '@/lib/informakon/rechavear'
import {
  montarGrupo, type GrupoRoteiro, type ItemRoteiro, type NotaLastro,
} from '@/lib/informakon/roteiro'

/**
 * Monta o ROTEIRO DE LANÇAMENTO da medição: por macro grupo, exatamente o que
 * se digita no Informakon.
 *
 * Junta o que já existe em três lugares diferentes — o boletim (percentual e
 * desconto por item), o retrato do ERP (saldo de cada nota) e o nosso cadastro
 * (data de emissão, para a ordem FIFO) — e devolve na ordem de digitar.
 *
 * Não calcula dinheiro novo: o percentual e o desconto vêm inteiros do
 * boletim. O que se resolve aqui é a APRESENTAÇÃO — agrupar no macro grupo,
 * que é a unidade do ERP, e repartir o desconto entre as notas respeitando o
 * saldo de cada uma.
 */

export interface RoteiroInformakon {
  medicao: { id: string; numero: number; status: string }
  grupos: GrupoRoteiro[]
  /** Σ do que o ERP vai liberar. */
  liberacao: number
  /** Σ do desconto a digitar. */
  desconto: number
  /** Σ do que tem de sobrar — o serviço medido. */
  servico: number
  /** Σ de nota de material que a FIP precisa emitir antes do lançamento. */
  fipPrecisaEmitir: number
  /** Σ de desconto sem lastro no ERP. Maior que zero = lançamento não fecha. */
  faltaLastro: number
  /** Retrato usado. `null` = nenhum retrato colado; sem ele não há lastro. */
  retrato: { snapshot_id: string; referencia: string | null; adotado: boolean } | null
}

const cent = (n: number) => Math.round(n * 100) / 100

export async function montarRoteiroInformakon(
  admin: SupabaseClient,
  contratoId: string,
  medicaoId: string,
): Promise<RoteiroInformakon | null> {
  const boletim = await calcularInformaconData(admin, contratoId, medicaoId)
  if (!boletim) return null

  // ── Lastro: as notas do retrato, reendereçadas para os macro itens em que
  //    NÓS as alocamos. Sem reendereçar, o roteiro mandaria descontar num
  //    grupo nota que o ERP arquivou em outro — e o desconto seria recusado.
  const adotadoId = boletim.retrato_adotado?.snapshot_id ?? null
  const snapRes = adotadoId
    ? await admin.from('informakon_saldo_snapshots').select('id, referencia').eq('id', adotadoId).maybeSingle()
    : await admin.from('informakon_saldo_snapshots').select('id, referencia')
        .eq('contrato_id', contratoId)
        .order('referencia', { ascending: false })
        .order('informado_em', { ascending: false })
        .limit(1).maybeSingle()

  const snap = snapRes.error ? null : (snapRes.data as any)
  const lastroPorChave = new Map<string, NotaLastro[]>()
  /** Nome do macro item como o ERP escreve — é o que ele vê na tela de lá. */
  const rotuloPorChave = new Map<string, string>()

  if (snap?.id) {
    const rot = await admin
      .from('informakon_saldo_linhas')
      .select('macro_item, grupo_codigo, detalhamento_codigo')
      .eq('snapshot_id', snap.id)
    for (const l of (rot.error ? [] : (rot.data || [])) as any[]) {
      const chave = String(l.detalhamento_codigo || l.grupo_codigo || '').trim()
      if (chave && !rotuloPorChave.has(chave)) rotuloPorChave.set(chave, String(l.macro_item ?? ''))
    }
  }

  if (snap?.id) {
    const notasRes = await admin
      .from('informakon_saldo_notas')
      .select('documento, numero_nf, grupo_codigo, detalhamento_codigo, valor_a_descontar, valor_descontado')
      .eq('snapshot_id', snap.id)
    if (!notasRes.error && (notasRes.data || []).length > 0) {
      const [alocacao, datas] = await Promise.all([
        carregarAlocacaoDeNotas(admin, contratoId),
        carregarDatasDeNotas(admin, contratoId),
      ])
      const rech = rechavearRetrato(
        (notasRes.data as any[]).map(n => ({
          chave: String(n.detalhamento_codigo || n.grupo_codigo || '').trim(),
          numeroNf: n.numero_nf ?? null,
          documento: n.documento ?? undefined,
          valorADescontar: Number(n.valor_a_descontar || 0),
          valorDescontado: Number(n.valor_descontado || 0),
        })),
        alocacao,
      )
      // Uma nota pode vir quebrada em várias linhas do mesmo grupo; o que se
      // digita é um valor só por nota, então o saldo é somado antes.
      const porChaveNumero = new Map<string, Map<string, NotaLastro>>()
      for (const n of rech.notas) {
        const numero = normalizarNumeroNota(n.numeroNf ?? n.documento)
        if (!numero || !n.chave) continue
        const doGrupo = porChaveNumero.get(n.chave) ?? new Map<string, NotaLastro>()
        const atual = doGrupo.get(numero)
        if (atual) atual.saldo += Number(n.valorADescontar) || 0
        else doGrupo.set(numero, {
          numero,
          documento: n.documento ?? `NF ${numero}`,
          data: datas.get(numero) ?? null,
          saldo: Number(n.valorADescontar) || 0,
        })
        porChaveNumero.set(n.chave, doGrupo)
      }
      for (const [chave, mapa] of porChaveNumero) {
        lastroPorChave.set(chave, [...mapa.values()].map(n => ({ ...n, saldo: cent(n.saldo) })))
      }
    }
  }

  // ── Agrupa o boletim no macro grupo, que é a unidade do ERP.
  const porChave = new Map<string, {
    rotulo: string; itens: ItemRoteiro[]
    desconto: number; servico: number; fip: number
  }>()

  for (const l of boletim.linhas) {
    const chave = chaveMacroItem(l.codigo)
    if (!chave) continue
    const liberacao = Number(l.informakon_a_lancar ?? l.dados_informakon) || 0
    const desconto = Number(l.nf_descontavel) || 0
    const servico = Number(l.wave_servico) || 0
    const fip = Number(l.fip_faturar) || 0
    // Item sem nada a lançar e sem nada a descontar não entra no roteiro:
    // uma folha com 200 linhas em branco não se lê.
    if (liberacao <= 0.005 && desconto <= 0.005 && fip <= 0.005) continue

    const g = porChave.get(chave) ?? { rotulo: '', itens: [], desconto: 0, servico: 0, fip: 0 }
    const valorItem = Number(l.valor_total_item) || 0
    const aLancarAcum = Number(l.servico_acumulado || 0)
      + Number(l.nf_ja_abatida || 0) + desconto
    g.itens.push({
      codigo: l.codigo,
      codigoInformakon: l.codigo_informakon ?? null,
      descricao: l.descricao,
      pct: Number(l.pct_informakon_a_lancar ?? l.pct_informakon) || 0,
      liberacao,
      pctFisicoAcumulado: Number(l.pct_acumulado) || 0,
      pctLancadoAcumulado: valorItem > 0 ? (aLancarAcum / valorItem) * 100 : 0,
    })
    g.desconto += desconto
    g.servico += servico
    g.fip += fip
    porChave.set(chave, g)
  }

  const grupos: GrupoRoteiro[] = []
  for (const [chave, g] of porChave) {
    g.itens.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    grupos.push(montarGrupo({
      chave,
      rotulo: rotuloPorChave.get(chave) || g.rotulo || `Macro item ${chave}`,
      itens: g.itens,
      desconto: cent(g.desconto),
      servico: cent(g.servico),
      fipPrecisaEmitir: cent(g.fip),
      lastro: lastroPorChave.get(chave) ?? [],
    }))
  }
  grupos.sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR', { numeric: true }))

  const soma = (f: (g: GrupoRoteiro) => number) => cent(grupos.reduce((s, g) => s + f(g), 0))
  return {
    medicao: {
      id: boletim.medicao.id,
      numero: boletim.medicao.numero,
      status: boletim.medicao.status,
    },
    grupos,
    liberacao: soma(g => g.liberacao),
    desconto: soma(g => g.desconto),
    servico: soma(g => g.servico),
    fipPrecisaEmitir: soma(g => g.fipPrecisaEmitir),
    faltaLastro: soma(g => g.distribuicao.faltaLastro),
    retrato: snap?.id
      ? { snapshot_id: String(snap.id), referencia: snap.referencia ?? null, adotado: !!adotadoId }
      : null,
  }
}
