// lib/db/origem.ts
import { createAdminClient } from '@/lib/supabase/admin'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { withSchemaFallback } from '@/lib/db/resilient'
import { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'
import { descendantDetalhamentoIds, type WbsNode } from './wbs-utils'
import type {
  OrigemItem,
  OrigemNotaFatDireto,
  OrigemNotaWave,
  OrigemPedidoSaldo,
  OrigemMedicaoSaldo,
  OrigemResponse,
  OrigemResumoStatus,
  OrigemTipo,
} from '@/types/origem'
import type { DashboardModo } from '@/types/dashboard'

/**
 * Aloca um valor de NF proporcionalmente entre seus itens, somente
 * considerando os que pertencem ao escopo (alvosDetIds).
 * Retorna o valor alocado total. Se nenhum item está no escopo, retorna 0.
 */
export function allocateNfToScope(
  itens: Array<{ detalhamento_id: string | null; valor_total: number }>,
  alvosDetIds: Set<string>,
  valorTotalNf: number,
): number {
  const totalSol = itens.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)
  if (totalSol <= 0) return 0
  const totalNoEscopo = itens.reduce((s, it) => {
    if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
      return s + (Number(it.valor_total) || 0)
    }
    return s
  }, 0)
  if (totalNoEscopo <= 0) return 0
  return valorTotalNf * (totalNoEscopo / totalSol)
}

type PedidoComNfs = {
  id: string
  numero: number | string
  tipo?: string | null
  fornecedor_cnpj?: string | null
  fornecedor_razao_social?: string | null
  itens: Array<{ detalhamento_id: string | null; valor_total: number }> | null
  nfs: Array<{ id: string; numero_nf: string; data_emissao: string; valor: number; status: string }> | null
}

/**
 * Pedidos fat-direto aprovados do contrato, com itens e NFs.
 *
 * Fonte comum de material E serviço: material e a NF de serviço da Wave
 * convivem em `solicitacoes_fat_direto`, separados por `tipo` (migration
 * 074). Quem chama decide o lado via `ehPedidoDeServicoWave`.
 */
async function carregarPedidosComNfs(contratoId: string): Promise<PedidoComNfs[]> {
  const admin = createAdminClient()
  const CORPO = `
      id,
      numero,
      fornecedor_cnpj,
      fornecedor_razao_social,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( id, numero_nf, data_emissao, valor, status )
    `
  const res = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(`tipo, ${CORPO}`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(CORPO)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    missingColumns: ['tipo'],
    context: 'origem_pedidosComNfs',
  })
  if (res.error || !res.data) return []
  return res.data as unknown as PedidoComNfs[]
}

export async function listOrigemRealizadoMaterial(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemNotaFatDireto[]> {
  const solicitacoes = await carregarPedidosComNfs(contratoId)

  const out: OrigemNotaFatDireto[] = []
  for (const sol of solicitacoes) {
    // A NF de serviço da Wave mora na mesma tabela — sem esse filtro ela
    // aparecia na lista de MATERIAL (e o modo serviço ficava vazio).
    if (ehPedidoDeServicoWave(sol)) continue
    const itens = (sol.itens ?? []) as Array<{ detalhamento_id: string | null; valor_total: number }>
    const nfs = (sol.nfs ?? []) as Array<{ id: string; numero_nf: string; data_emissao: string; valor: number; status: string }>

    for (const nf of nfs) {
      if (!nfReservaSaldo(nf.status)) continue
      const valorAlocado = allocateNfToScope(itens, alvosDetIds, Number(nf.valor) || 0)
      if (valorAlocado <= 0) continue
      out.push({
        tipo: 'nf-fat-direto',
        id: nf.id,
        numero: String(nf.numero_nf ?? ''),
        data: String(nf.data_emissao ?? ''),
        valorAlocado,
        valorTotalNf: Number(nf.valor) || 0,
        status: String(nf.status ?? ''),
        pedidoId: sol.id,
        pedidoNumero: String(sol.numero ?? ''),
      })
    }
  }
  return out
}

/**
 * NFs de SERVIÇO alocadas ao escopo.
 *
 * Fonte primária: pedidos `wave_servico` em `solicitacoes_fat_direto` — é
 * onde a NF de serviço da Wave realmente é gravada na aprovação da medição.
 *
 * Antes esta função lia apenas `notas_fiscais_wave`, tabela criada como
 * ESQUELETO na migration 059 e que nunca recebeu nenhum INSERT no produto.
 * Ela estava sempre vazia, então a função retornava `[]` na primeira guarda
 * e a página exibia "Nenhum item encontrado" — enquanto o modo material,
 * lendo a tabela certa, funcionava. `notas_fiscais_wave` segue sendo
 * consultada como fonte complementar, para quando a UI de cadastro existir.
 */
export async function listOrigemRealizadoServico(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemNotaWave[]> {
  const admin = createAdminClient()
  const out: OrigemNotaWave[] = []

  // --- Fonte primária: pedidos wave_servico + suas NFs ---
  for (const sol of await carregarPedidosComNfs(contratoId)) {
    if (!ehPedidoDeServicoWave(sol)) continue
    const itens = (sol.itens ?? []) as Array<{ detalhamento_id: string | null; valor_total: number }>
    for (const nf of (sol.nfs ?? [])) {
      if (!nfReservaSaldo(nf.status)) continue
      const valorAlocado = allocateNfToScope(itens, alvosDetIds, Number(nf.valor) || 0)
      if (valorAlocado <= 0) continue
      out.push({
        tipo: 'nf-wave',
        id: nf.id,
        numero: String(nf.numero_nf ?? ''),
        data: String(nf.data_emissao ?? ''),
        valorAlocado,
        valorTotalNf: Number(nf.valor) || 0,
        status: String(nf.status ?? ''),
        // A NF de serviço nasce de uma medição, mas o vínculo direto que
        // temos aqui é o pedido; expomos o pedido no lugar da medição.
        medicaoId: sol.id,
        medicaoNumero: `FIP-${String(sol.numero ?? '').padStart(4, '0')}`,
        pedidoId: sol.id,
      })
    }
  }

  // --- Fonte complementar: notas_fiscais_wave (hoje sem UI de cadastro) ---
  let nfWaveData: Array<{ id: string; numero_nf: string; data_emissao: string; valor: number; status: string; medicao_id: string }> = []
  try {
    const { data, error } = await admin
      .from('notas_fiscais_wave')
      .select('id, numero_nf, data_emissao, valor, status, medicao_id')
      .eq('contrato_id', contratoId)
      .in('status', ['pendente', 'validada'])
    if (!error && data) nfWaveData = data
  } catch {
    return out
  }
  if (nfWaveData.length === 0) return out

  const medicaoIds = Array.from(new Set(nfWaveData.map(n => n.medicao_id))).filter(Boolean)
  if (medicaoIds.length === 0) return out

  const [{ data: medicoes }, { data: itensMed }] = await Promise.all([
    admin.from('medicoes').select('id, numero').in('id', medicaoIds),
    admin
      .from('medicao_itens')
      .select('medicao_id, detalhamento_id, valor_medido')
      .in('medicao_id', medicaoIds),
  ])

  const medicaoNumeroById = new Map<string, string>()
  for (const m of medicoes ?? []) medicaoNumeroById.set(m.id, String(m.numero ?? ''))

  const itensPorMedicao = new Map<string, Array<{ detalhamento_id: string | null; valor_total: number }>>()
  for (const it of itensMed ?? []) {
    const arr = itensPorMedicao.get(it.medicao_id) ?? []
    arr.push({ detalhamento_id: it.detalhamento_id, valor_total: Number(it.valor_medido) || 0 })
    itensPorMedicao.set(it.medicao_id, arr)
  }

  for (const nf of nfWaveData) {
    const itens = itensPorMedicao.get(nf.medicao_id) ?? []
    const valorAlocado = allocateNfToScope(itens, alvosDetIds, Number(nf.valor) || 0)
    if (valorAlocado <= 0) continue
    out.push({
      tipo: 'nf-wave',
      id: nf.id,
      numero: String(nf.numero_nf ?? ''),
      data: String(nf.data_emissao ?? ''),
      valorAlocado,
      valorTotalNf: Number(nf.valor) || 0,
      status: String(nf.status ?? ''),
      medicaoId: nf.medicao_id,
      medicaoNumero: medicaoNumeroById.get(nf.medicao_id) ?? '',
    })
  }
  return out
}

export async function listOrigemSaldoMaterial(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemPedidoSaldo[]> {
  const admin = createAdminClient()
  const { data: solicitacoes, error } = await admin
    .from('solicitacoes_fat_direto')
    .select(`
      id,
      numero,
      data_aprovacao,
      fornecedor_cnpj,
      fornecedor_razao_social,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
    `)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
    .is('deletado_em', null)

  if (error || !solicitacoes) return []

  const out: OrigemPedidoSaldo[] = []
  for (const sol of solicitacoes) {
    // Saldo de MATERIAL não inclui o pedido de serviço da Wave.
    if (ehPedidoDeServicoWave(sol)) continue
    const itens = (sol.itens ?? []) as Array<{ detalhamento_id: string | null; valor_total: number }>
    const aprovadoEscopo = itens.reduce((s, it) => {
      if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
        return s + (Number(it.valor_total) || 0)
      }
      return s
    }, 0)
    if (aprovadoEscopo <= 0) continue

    const totalSol = itens.reduce((s, it) => s + (Number(it.valor_total) || 0), 0)
    const totalNfs = (sol.nfs ?? [])
      .filter((n: { status: string }) => nfReservaSaldo(n.status))
      .reduce((s: number, n: { valor: number }) => s + (Number(n.valor) || 0), 0)
    const emNfEscopo = totalSol > 0 ? totalNfs * (aprovadoEscopo / totalSol) : 0
    const saldo = Math.max(0, aprovadoEscopo - emNfEscopo)
    if (saldo <= 0) continue

    out.push({
      tipo: 'pedido-saldo',
      id: sol.id,
      numero: String(sol.numero ?? ''),
      aprovadoEm: sol.data_aprovacao ? String(sol.data_aprovacao) : null,
      aprovado: aprovadoEscopo,
      emNf: emNfEscopo,
      saldo,
    })
  }
  return out
}

export async function listOrigemSaldoServico(
  contratoId: string,
  alvosDetIds: Set<string>,
): Promise<OrigemMedicaoSaldo[]> {
  const admin = createAdminClient()
  const { data: medicoes, error } = await admin
    .from('medicoes')
    .select(`
      id,
      numero,
      data_aprovacao,
      itens:medicao_itens ( detalhamento_id, valor_medido )
    `)
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')

  if (error || !medicoes) return []

  const medicaoIds = medicoes.map(m => m.id)
  const nfWavePorMedicao = new Map<string, number>()
  try {
    const { data: nfs } = await admin
      .from('notas_fiscais_wave')
      .select('medicao_id, valor, status')
      .eq('contrato_id', contratoId)
      .in('status', ['pendente', 'validada'])
      .in('medicao_id', medicaoIds)
    for (const nf of nfs ?? []) {
      const cur = nfWavePorMedicao.get(nf.medicao_id) ?? 0
      nfWavePorMedicao.set(nf.medicao_id, cur + (Number(nf.valor) || 0))
    }
  } catch {
    // sem tabela; map fica vazio
  }

  const out: OrigemMedicaoSaldo[] = []
  for (const med of medicoes) {
    const itens = (med.itens ?? []) as Array<{ detalhamento_id: string | null; valor_medido: number }>
    const realizadoEscopo = itens.reduce((s, it) => {
      if (it.detalhamento_id && alvosDetIds.has(it.detalhamento_id)) {
        return s + (Number(it.valor_medido) || 0)
      }
      return s
    }, 0)
    if (realizadoEscopo <= 0) continue

    const totalMed = itens.reduce((s, it) => s + (Number(it.valor_medido) || 0), 0)
    const totalNfs = nfWavePorMedicao.get(med.id) ?? 0
    const emNfEscopo = totalMed > 0 ? totalNfs * (realizadoEscopo / totalMed) : 0
    const saldo = Math.max(0, realizadoEscopo - emNfEscopo)
    if (saldo <= 0) continue

    out.push({
      tipo: 'medicao-saldo',
      id: med.id,
      numero: String(med.numero ?? ''),
      aprovadoEm: med.data_aprovacao ? String(med.data_aprovacao) : null,
      aprovado: realizadoEscopo,
      emNf: emNfEscopo,
      saldo,
    })
  }
  return out
}

export async function listOrigem(
  contratoId: string,
  modo: DashboardModo,
  origem: OrigemTipo,
  alvosDetIds: Set<string>,
): Promise<OrigemItem[]> {
  if (origem === 'realizado') {
    if (modo === 'material') return listOrigemRealizadoMaterial(contratoId, alvosDetIds)
    if (modo === 'servico')  return listOrigemRealizadoServico(contratoId, alvosDetIds)
    const [m, s] = await Promise.all([
      listOrigemRealizadoMaterial(contratoId, alvosDetIds),
      listOrigemRealizadoServico(contratoId, alvosDetIds),
    ])
    return [...m, ...s]
  }
  if (modo === 'material') return listOrigemSaldoMaterial(contratoId, alvosDetIds)
  if (modo === 'servico')  return listOrigemSaldoServico(contratoId, alvosDetIds)
  const [m, s] = await Promise.all([
    listOrigemSaldoMaterial(contratoId, alvosDetIds),
    listOrigemSaldoServico(contratoId, alvosDetIds),
  ])
  return [...m, ...s]
}

/**
 * Função compartilhada entre o route handler `/api/contratos/[id]/origem`
 * e a página Server Component `/contratos/[id]/origem`. Centraliza:
 * - Carregamento da WBS
 * - Resolução de scope → conjunto de detalhamento_ids
 * - listOrigem(...)
 * - Cálculo de total + count + resumoStatus + scopeInfo
 * - Ordenação por data desc
 *
 * Chamando isto direto (em vez de fazer self-fetch HTTP), o Server Component
 * evita problemas de header/cookie/timeout em produção (Vercel) e elimina
 * uma round-trip de função serverless.
 */
export async function getOrigemPageData(
  contratoId: string,
  modo: DashboardModo,
  origem: OrigemTipo,
  scopeId: string | null,
): Promise<OrigemResponse> {
  const admin = createAdminClient()

  // Carregar a WBS completa do contrato
  const [grupos, tarefas, dets] = await Promise.all([
    admin.from('grupos_macro').select('id, codigo, nome').eq('contrato_id', contratoId),
    admin.from('tarefas').select('id, codigo, nome, grupo_macro_id'),
    admin.from('detalhamentos').select('id, codigo, descricao, tarefa_id'),
  ])

  const nodes: Array<WbsNode & { codigo: string; nome: string }> = [
    ...((grupos.data ?? []).map(g => ({
      id: g.id as string,
      pai_id: null as string | null,
      nivel: 1 as const,
      codigo: String(g.codigo),
      nome: String(g.nome),
    }))),
    ...((tarefas.data ?? []).map(t => ({
      id: t.id as string,
      pai_id: t.grupo_macro_id as string | null,
      nivel: 2 as const,
      codigo: String(t.codigo),
      nome: String(t.nome),
    }))),
    ...((dets.data ?? []).map(d => ({
      id: d.id as string,
      pai_id: d.tarefa_id as string | null,
      nivel: 3 as const,
      codigo: String(d.codigo),
      nome: String(d.descricao),
    }))),
  ]

  const alvos = descendantDetalhamentoIds(scopeId, nodes)
  const itens = await listOrigem(contratoId, modo, origem, alvos)

  const total = itens.reduce((s, it) => {
    if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') return s + it.valorAlocado
    return s + it.saldo
  }, 0)

  let resumoStatus: OrigemResumoStatus | undefined = undefined
  if (origem === 'realizado') {
    // Vocabulário atual de `notas_fiscais_fat_direto` (migration 065):
    // aguardando_aprovacao | aprovada | em_correcao | cancelada. Os antigos
    // validada/pendente/rejeitada seguem aceitos pra `notas_fiscais_wave` e
    // registros legados — antes só eles eram testados, então os contadores
    // ficavam sempre zerados e os chips nunca apareciam.
    resumoStatus = { validadas: 0, pendentes: 0, rejeitadas: 0 }
    for (const it of itens) {
      if (it.tipo === 'nf-fat-direto' || it.tipo === 'nf-wave') {
        const s = String(it.status ?? '').toLowerCase()
        if (s === 'aprovada' || s === 'validada') resumoStatus.validadas! += 1
        else if (s === 'aguardando_aprovacao' || s === 'em_correcao' || s === 'pendente') resumoStatus.pendentes! += 1
        else if (s === 'cancelada' || s === 'rejeitada') resumoStatus.rejeitadas! += 1
      }
    }
  }

  let scopeInfo: OrigemResponse['scope'] = null
  if (scopeId === null) {
    scopeInfo = { id: null, codigo: '', nome: 'Todos os grupos', nivel: null }
  } else {
    const node = nodes.find(n => n.id === scopeId)
    if (node) {
      scopeInfo = { id: node.id, codigo: node.codigo, nome: node.nome, nivel: node.nivel }
    }
  }

  itens.sort((a, b) => {
    const da = 'data' in a ? a.data : (a.aprovadoEm ?? '')
    const db = 'data' in b ? b.data : (b.aprovadoEm ?? '')
    return db.localeCompare(da)
  })

  return { total, count: itens.length, itens, resumoStatus, scope: scopeInfo, modo, origem }
}
