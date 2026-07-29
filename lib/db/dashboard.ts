/**
 * Backend de agregação do dashboard de análise hierárquica do contrato.
 *
 * Single-shot query: dado um contratoId e filtros de drill-down opcionais,
 * carrega a estrutura inteira (grupos → tarefas → detalhamentos), todas
 * as movimentações financeiras (medições aprovadas, NFs material via
 * solicitações fat-direto, NFs Wave de serviço) e devolve um payload
 * `DashboardResponse` no nível alvo, com agregados já somados pra cima.
 *
 * Decisões importantes:
 *   - Itens de solicitação ou de medição com `detalhamento_id NULL` são
 *     ignorados (não há onde alocar — não impactam saldo).
 *   - NFs material (fat-direto) com `status='rejeitada'` NÃO contam como
 *     realizado_material; pendente e validada contam.
 *   - NFs Wave com `status='rejeitada'` ou `'cancelada'` NÃO contam;
 *     pendente e validada contam.
 *   - Pedidos fat-direto contam como aprovado_material apenas com
 *     `status='aprovado'` E `deletado_em IS NULL`.
 *   - Embedding de NFs em solicitações usa hint `!solicitacao_id` por
 *     causa da FK extra adicionada na migration 054 (PGRST201 silencioso
 *     sem o hint).
 *   - A NF de SERVIÇO real é o pedido `wave_servico` em
 *     `solicitacoes_fat_direto` (migration 074), não `notas_fiscais_wave`
 *     — essa tabela é esqueleto da migration 059 e nunca recebeu INSERT.
 *     Ela segue sendo lida como fonte COMPLEMENTAR; o try/catch absorve
 *     "relation does not exist".
 *   - Ordenação: `compareCodigo` (lib/db/wbs-utils), comparação numérica
 *     hierárquica. Não usa localeCompare porque '10' viria antes de '2'
 *     em ordem lexicográfica simples.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { nfReservaSaldo } from '@/lib/db/nf-status'
import { withSchemaFallback } from '@/lib/db/resilient'
import { ehPedidoDeServicoWave } from '@/lib/db/saldo-detalhamento'
import { compareCodigo } from '@/lib/db/wbs-utils'
import type {
  DashboardItem,
  DashboardNivel,
  DashboardResponse,
} from '@/types/dashboard'

interface RawDetalhamento {
  id: string
  codigo: string
  descricao: string
  ordem: number | null
  quantidade_contratada: number | null
  valor_unitario: number | null
  valor_material_unit: number | null
  valor_servico_unit: number | null
  tarefa_id: string
}

interface RawTarefa {
  id: string
  grupo_macro_id: string
  codigo: string
  nome: string
  ordem: number | null
  valor_total: number | null
  valor_material: number | null
  valor_servico: number | null
  detalhamentos: RawDetalhamento[] | null
}

interface RawGrupo {
  id: string
  contrato_id: string
  codigo: string
  nome: string
  ordem: number | null
  valor_contratado: number | null
  valor_material: number | null
  valor_servico: number | null
  tarefas: RawTarefa[] | null
}

export async function getDashboardData(
  contratoId: string,
  filtros: { grupo_id?: string; tarefa_id?: string; detalhamento_id?: string },
): Promise<DashboardResponse> {
  const admin = createAdminClient()

  // --------------------------------------------------------------------
  // 1) Estrutura completa: grupos → tarefas → detalhamentos
  // --------------------------------------------------------------------
  const { data: gruposRaw, error: estruturaErr } = await admin
    .from('grupos_macro')
    .select(`
      id, contrato_id, codigo, nome, ordem,
      valor_contratado, valor_material, valor_servico,
      tarefas (
        id, grupo_macro_id, codigo, nome, ordem,
        valor_total, valor_material, valor_servico,
        detalhamentos (
          id, tarefa_id, codigo, descricao, ordem,
          quantidade_contratada, valor_unitario,
          valor_material_unit, valor_servico_unit
        )
      )
    `)
    .eq('contrato_id', contratoId)
    .order('ordem')
  if (estruturaErr) throw estruturaErr

  const grupos = (gruposRaw || []) as unknown as RawGrupo[]

  // Indexes auxiliares pra lookup O(1)
  const todosDets: RawDetalhamento[] = []
  const detPorId = new Map<string, RawDetalhamento>()
  const tarefaPorId = new Map<string, RawTarefa>()
  const grupoPorId = new Map<string, RawGrupo>()
  const detsPorTarefa = new Map<string, RawDetalhamento[]>()
  const tarefasPorGrupo = new Map<string, RawTarefa[]>()

  for (const g of grupos) {
    grupoPorId.set(g.id, g)
    const tarefasDoGrupo: RawTarefa[] = []
    for (const t of g.tarefas || []) {
      tarefaPorId.set(t.id, t)
      tarefasDoGrupo.push(t)
      const detsDaTarefa: RawDetalhamento[] = []
      for (const d of t.detalhamentos || []) {
        detPorId.set(d.id, d)
        detsDaTarefa.push(d)
        todosDets.push(d)
      }
      detsPorTarefa.set(t.id, detsDaTarefa)
    }
    tarefasPorGrupo.set(g.id, tarefasDoGrupo)
  }

  // --------------------------------------------------------------------
  // 2) Medições aprovadas + medicao_itens → realizado_servico_det
  // --------------------------------------------------------------------
  const realizadoServicoDet = new Map<string, number>()

  const { data: medicoesAprov, error: medErr } = await admin
    .from('medicoes')
    .select('id')
    .eq('contrato_id', contratoId)
    .eq('status', 'aprovado')
  if (medErr) throw medErr

  const medicaoIdsAprov = (medicoesAprov || []).map(m => m.id as string)

  if (medicaoIdsAprov.length > 0) {
    // `valor_medido` é GENERATED = quantidade_medida × valor_unitario, e
    // `valor_unitario` é o preço GLOBAL (material + MO). Usá-lo como
    // "realizado de serviço" fazia a parcela de material entrar duas vezes
    // no realizado_total (uma pela NF de material, outra dentro do medido),
    // estourando o contratado e zerando o saldo pelo clamp.
    //
    // A fonte correta é `valor_servico_correspondente` (snapshot congelado
    // na aprovação, migration 052). Fallback: quantidade × valor_servico_unit
    // do detalhamento, pra medições anteriores à 052.
    const SELECT_COM_SNAPSHOT = 'detalhamento_id, valor_medido, quantidade_medida, valor_servico_correspondente, medicao_id'
    const SELECT_SEM_SNAPSHOT = 'detalhamento_id, valor_medido, quantidade_medida, medicao_id'
    const itensMedRes = await withSchemaFallback({
      primary: () => admin
        .from('medicao_itens')
        .select(SELECT_COM_SNAPSHOT)
        .in('medicao_id', medicaoIdsAprov),
      fallback: () => admin
        .from('medicao_itens')
        .select(SELECT_SEM_SNAPSHOT)
        .in('medicao_id', medicaoIdsAprov),
      missingColumns: ['valor_servico_correspondente'],
      context: 'dashboard_medicaoItens',
    })
    if (itensMedRes.error) throw itensMedRes.error

    for (const it of (itensMedRes.data || []) as Array<{
      detalhamento_id: string | null
      valor_medido: number | string | null
      quantidade_medida: number | string | null
      valor_servico_correspondente?: number | string | null
    }>) {
      const detId = it.detalhamento_id
      if (!detId) continue

      const snapshot = Number(it.valor_servico_correspondente || 0)
      let v: number
      if (snapshot > 0) {
        v = snapshot
      } else {
        const det = detPorId.get(detId)
        const servUnit = Number(det?.valor_servico_unit || 0)
        v = servUnit > 0
          ? Number(it.quantidade_medida || 0) * servUnit
          // Item sem quebra material/MO no orçamento: `valor_medido` é a
          // única grandeza disponível e representa o item inteiro.
          : Number(it.valor_medido || 0)
      }
      realizadoServicoDet.set(detId, (realizadoServicoDet.get(detId) || 0) + v)
    }
  }

  // --------------------------------------------------------------------
  // 3) Solicitações fat-direto aprovadas + itens + NFs (lado material)
  //
  //    Pra cada solicitação aprovada (não-deletada):
  //      - itens com detalhamento_id contam pra `aprovado_material_det`
  //      - NFs (status != 'rejeitada') são distribuídas
  //        proporcionalmente entre os itens (por valor_total do item /
  //        valor_total da solicitação) — alocado em
  //        `realizado_material_det`.
  // --------------------------------------------------------------------
  const aprovadoMaterialDet = new Map<string, number>()
  const realizadoMaterialDet = new Map<string, number>()
  // NFs de SERVIÇO por detalhamento. Alimentado no mesmo passo dos pedidos
  // (os `wave_servico` moram na mesma tabela) e, complementarmente, por
  // `notas_fiscais_wave` no passo 4.
  const nfWaveServicoDet = new Map<string, number>()

  // `tipo` (migration 074) separa a NF de serviço da Wave dos pedidos de
  // material. Sem esse filtro, o pedido `wave_servico` entrava como material
  // aprovado — e a NF dele como material realizado. Fallback pra janela de
  // schema cache stale: CNPJ / razão social identificam o mesmo pedido.
  const SOL_SELECT = `
      id, status, deletado_em, fornecedor_cnpj, fornecedor_razao_social,
      itens:itens_solicitacao_fat_direto ( detalhamento_id, valor_total, valor_devolvido ),
      nfs:notas_fiscais_fat_direto!solicitacao_id ( valor, status )
    `
  const solRes = await withSchemaFallback({
    primary: () => admin
      .from('solicitacoes_fat_direto')
      .select(`tipo, ${SOL_SELECT}`)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    fallback: () => admin
      .from('solicitacoes_fat_direto')
      .select(SOL_SELECT)
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .is('deletado_em', null),
    missingColumns: ['tipo', 'valor_devolvido'],
    context: 'dashboard_solicitacoes',
  })
  if (solRes.error) throw solRes.error

  for (const sol of (solRes.data || []) as Array<{
    tipo?: string | null
    fornecedor_cnpj?: string | null
    fornecedor_razao_social?: string | null
    itens: Array<{ detalhamento_id: string | null; valor_total: number | string | null; valor_devolvido?: number | string | null }> | null
    nfs: Array<{ valor: number | string | null; status: string | null }> | null
  }>) {
    // Pedido de serviço da Wave não consome nem realiza MATERIAL — mas a NF
    // dele é a NF de SERVIÇO, e é ela que abate `saldo_medicao_servico`.
    const ehServico = ehPedidoDeServicoWave(sol)

    const itensVal = (sol.itens || [])
      .map(it => ({
        detId: it.detalhamento_id as string | null,
        // Devoluções (migration 050) liberam o saldo do item.
        valor: Math.max(0, Number(it.valor_total || 0) - Number(it.valor_devolvido || 0)),
      }))
      .filter((x): x is { detId: string; valor: number } => x.detId !== null)

    if (itensVal.length === 0) continue

    const totalSol = itensVal.reduce((s, it) => s + it.valor, 0)
    if (!ehServico) {
      for (const it of itensVal) {
        aprovadoMaterialDet.set(
          it.detId,
          (aprovadoMaterialDet.get(it.detId) || 0) + it.valor,
        )
      }
    }

    // NFs que contam: tudo exceto cancelada (NF pendente/aprovada conta).
    const totalNfsSol = (sol.nfs || [])
      .filter(nf => nfReservaSaldo(nf.status))
      .reduce((s, nf) => s + Number(nf.valor || 0), 0)

    if (totalSol > 0 && totalNfsSol > 0) {
      const alvo = ehServico ? nfWaveServicoDet : realizadoMaterialDet
      for (const it of itensVal) {
        const share = it.valor / totalSol
        alvo.set(it.detId, (alvo.get(it.detId) || 0) + totalNfsSol * share)
      }
    }
  }

  // --------------------------------------------------------------------
  // 4) NFs Wave (lado serviço) → nfWaveServicoDet — FONTE COMPLEMENTAR
  //
  //    Pra cada NF Wave com `medicao_id` preenchido e `status` em
  //    ('pendente','validada'):
  //      - achar todos os medicao_itens daquela medição
  //      - distribuir o `valor` da NF proporcionalmente entre os
  //        detalhamentos daqueles itens (peso = valor_medido)
  //
  //    `notas_fiscais_wave` nasceu como ESQUELETO na migration 059 e nunca
  //    recebeu INSERT no produto — a NF de serviço real é gravada como pedido
  //    `wave_servico` em `solicitacoes_fat_direto` (tratado no passo 3). Ler
  //    só daqui deixava `nfWaveServicoDet` sempre vazio, e o resultado era
  //    `saldo_medicao_servico == realizado_servico`: a coluna "Saldo med."
  //    repetia o realizado e a NF emitida nunca abatia nada.
  //
  //    Segue consultada pra quando a UI de cadastro existir. Try/catch
  //    garante que ausência da tabela degrada graciosamente.
  // --------------------------------------------------------------------
  let nfWaveRows: Array<{
    medicao_id: string | null
    valor: number | string | null
    status: string | null
  }> = []
  try {
    const { data: nfWaveData, error: nfWaveErr } = await admin
      .from('notas_fiscais_wave')
      .select('medicao_id, valor, status')
      .eq('contrato_id', contratoId)
      .in('status', ['pendente', 'validada'])
    if (nfWaveErr) {
      // Tabela ausente (migration 059 não rodada) — degrada pra lista vazia
      const code = (nfWaveErr as { code?: string }).code
      const msg = (nfWaveErr as { message?: string }).message || ''
      if (code === '42P01' || /does not exist|relation .* not found/i.test(msg)) {
        nfWaveRows = []
      } else {
        throw nfWaveErr
      }
    } else {
      nfWaveRows = nfWaveData || []
    }
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code
    const msg = (e as { message?: string })?.message || ''
    if (code === '42P01' || /does not exist|relation .* not found/i.test(msg)) {
      nfWaveRows = []
    } else {
      throw e
    }
  }

  if (nfWaveRows.length > 0) {
    // Pra distribuir, precisamos dos itens das medições referenciadas.
    const medIdsNfWave = Array.from(
      new Set(
        nfWaveRows
          .map(r => r.medicao_id)
          .filter((x): x is string => !!x),
      ),
    )

    if (medIdsNfWave.length > 0) {
      const { data: itensWaveMed, error: itensWaveErr } = await admin
        .from('medicao_itens')
        .select('medicao_id, detalhamento_id, valor_medido')
        .in('medicao_id', medIdsNfWave)
      if (itensWaveErr) throw itensWaveErr

      // Indexa: medicao_id → { totalMed, itens: [{detId, valor}] }
      const itensPorMedicao = new Map<
        string,
        { total: number; itens: Array<{ detId: string; valor: number }> }
      >()
      for (const it of (itensWaveMed || []) as Array<{
        medicao_id: string
        detalhamento_id: string | null
        valor_medido: number | string | null
      }>) {
        const detId = it.detalhamento_id
        if (!detId) continue
        const v = Number(it.valor_medido || 0)
        const entry = itensPorMedicao.get(it.medicao_id) || { total: 0, itens: [] }
        entry.itens.push({ detId, valor: v })
        entry.total += v
        itensPorMedicao.set(it.medicao_id, entry)
      }

      for (const nf of nfWaveRows) {
        if (!nf.medicao_id) continue
        const entry = itensPorMedicao.get(nf.medicao_id)
        if (!entry || entry.total <= 0) continue
        const valorNf = Number(nf.valor || 0)
        if (valorNf <= 0) continue
        for (const it of entry.itens) {
          const share = it.valor / entry.total
          nfWaveServicoDet.set(
            it.detId,
            (nfWaveServicoDet.get(it.detId) || 0) + valorNf * share,
          )
        }
      }
    }
  }

  // --------------------------------------------------------------------
  // 5) Helper que monta um DashboardItem somando valores filhos
  // --------------------------------------------------------------------
  function buildItemDet(d: RawDetalhamento): DashboardItem {
    const qtdContr = Number(d.quantidade_contratada || 0)
    const matUnit = Number(d.valor_material_unit || 0)
    const servUnit = Number(d.valor_servico_unit || 0)
    const valorUnit = Number(d.valor_unitario || (matUnit + servUnit))

    const valorContratadoMaterial = qtdContr * matUnit
    const valorContratadoServico = qtdContr * servUnit
    const valorContratadoTotal = qtdContr * valorUnit

    const realizadoMaterial = realizadoMaterialDet.get(d.id) || 0
    const realizadoServico = realizadoServicoDet.get(d.id) || 0
    const aprovadoMaterial = aprovadoMaterialDet.get(d.id) || 0
    const nfWaveServico = nfWaveServicoDet.get(d.id) || 0

    return {
      id: d.id,
      codigo: d.codigo,
      nome: d.descricao,
      nivel: 3,
      pai_id: d.tarefa_id,
      tem_filhos: false,
      valor_contratado_total: valorContratadoTotal,
      valor_contratado_material: valorContratadoMaterial,
      valor_contratado_servico: valorContratadoServico,
      realizado_total: realizadoMaterial + realizadoServico,
      realizado_material: realizadoMaterial,
      realizado_servico: realizadoServico,
      // Sem clamp: saldo negativo = item estourado. Esconder atrás de 0,00
      // fazia o estouro passar despercebido justamente onde ele importa.
      saldo_aprovado_material: aprovadoMaterial - realizadoMaterial,
      saldo_medicao_servico: realizadoServico - nfWaveServico,
    }
  }

  function buildItemTarefa(t: RawTarefa): DashboardItem {
    const dets = detsPorTarefa.get(t.id) || []
    let realizadoMaterial = 0
    let realizadoServico = 0
    let aprovadoMaterial = 0
    let nfWaveServico = 0
    let valorContratadoMaterial = 0
    let valorContratadoServico = 0
    for (const d of dets) {
      const qtdContr = Number(d.quantidade_contratada || 0)
      const matUnit = Number(d.valor_material_unit || 0)
      const servUnit = Number(d.valor_servico_unit || 0)
      valorContratadoMaterial += qtdContr * matUnit
      valorContratadoServico += qtdContr * servUnit
      realizadoMaterial += realizadoMaterialDet.get(d.id) || 0
      realizadoServico += realizadoServicoDet.get(d.id) || 0
      aprovadoMaterial += aprovadoMaterialDet.get(d.id) || 0
      nfWaveServico += nfWaveServicoDet.get(d.id) || 0
    }

    // O pai TEM que fechar com a soma dos filhos, senão o drill-down não
    // reconcilia (era o caso de tarefas cujo `valor_total` de cabeçalho
    // divergia dos detalhamentos — ver vw_orcamento_divergencias, mig. 040).
    // Só caímos pro valor de cabeçalho quando a tarefa não tem filhos.
    let valorContratadoTotal = 0
    for (const d of dets) {
      const qtdContr = Number(d.quantidade_contratada || 0)
      const matUnit = Number(d.valor_material_unit || 0)
      const servUnit = Number(d.valor_servico_unit || 0)
      const valorUnit = Number(d.valor_unitario || (matUnit + servUnit))
      valorContratadoTotal += qtdContr * valorUnit
    }

    if (dets.length === 0) {
      valorContratadoTotal = Number(t.valor_total || 0)
      valorContratadoMaterial = Number(t.valor_material || 0)
      valorContratadoServico = Number(t.valor_servico || 0)
    }

    return {
      id: t.id,
      codigo: t.codigo,
      nome: t.nome,
      nivel: 2,
      pai_id: t.grupo_macro_id,
      tem_filhos: dets.length > 0,
      valor_contratado_total: valorContratadoTotal,
      valor_contratado_material: valorContratadoMaterial,
      valor_contratado_servico: valorContratadoServico,
      realizado_total: realizadoMaterial + realizadoServico,
      realizado_material: realizadoMaterial,
      realizado_servico: realizadoServico,
      saldo_aprovado_material: aprovadoMaterial - realizadoMaterial,
      saldo_medicao_servico: realizadoServico - nfWaveServico,
    }
  }

  function buildItemGrupo(g: RawGrupo): DashboardItem {
    const tarefas = tarefasPorGrupo.get(g.id) || []
    let realizadoMaterial = 0
    let realizadoServico = 0
    let aprovadoMaterial = 0
    let nfWaveServico = 0
    // Mesmo princípio do nível 2: o grupo fecha com a soma dos filhos.
    // Antes lia `grupos_macro.valor_contratado` puro, sem fallback nenhum —
    // grupo com valor de cabeçalho zerado mostrava Contratado 0 com
    // Realizado > 0.
    let valorContratadoTotal = 0
    let valorContratadoMaterial = 0
    let valorContratadoServico = 0
    let temDets = false
    for (const t of tarefas) {
      const dets = detsPorTarefa.get(t.id) || []
      for (const d of dets) {
        temDets = true
        const qtdContr = Number(d.quantidade_contratada || 0)
        const matUnit = Number(d.valor_material_unit || 0)
        const servUnit = Number(d.valor_servico_unit || 0)
        const valorUnit = Number(d.valor_unitario || (matUnit + servUnit))
        valorContratadoTotal += qtdContr * valorUnit
        valorContratadoMaterial += qtdContr * matUnit
        valorContratadoServico += qtdContr * servUnit
        realizadoMaterial += realizadoMaterialDet.get(d.id) || 0
        realizadoServico += realizadoServicoDet.get(d.id) || 0
        aprovadoMaterial += aprovadoMaterialDet.get(d.id) || 0
        nfWaveServico += nfWaveServicoDet.get(d.id) || 0
      }
    }

    if (!temDets) {
      valorContratadoTotal = Number(g.valor_contratado || 0)
      valorContratadoMaterial = Number(g.valor_material || 0)
      valorContratadoServico = Number(g.valor_servico || 0)
    }

    return {
      id: g.id,
      codigo: g.codigo,
      nome: g.nome,
      nivel: 1,
      pai_id: null,
      tem_filhos: tarefas.length > 0,
      valor_contratado_total: valorContratadoTotal,
      valor_contratado_material: valorContratadoMaterial,
      valor_contratado_servico: valorContratadoServico,
      realizado_total: realizadoMaterial + realizadoServico,
      realizado_material: realizadoMaterial,
      realizado_servico: realizadoServico,
      saldo_aprovado_material: aprovadoMaterial - realizadoMaterial,
      saldo_medicao_servico: realizadoServico - nfWaveServico,
    }
  }

  // --------------------------------------------------------------------
  // 6) Decidir nivel e selecionar itens
  // --------------------------------------------------------------------
  let nivel: DashboardNivel = 1
  let grupoIdFiltrado: string | null = null
  let tarefaIdFiltrado: string | null = null
  let detalhamentoIdFiltrado: string | null = null
  let itens: DashboardItem[] = []

  if (filtros.detalhamento_id) {
    nivel = 3
    detalhamentoIdFiltrado = filtros.detalhamento_id
    const det = detPorId.get(filtros.detalhamento_id)
    if (det) {
      const tarefa = tarefaPorId.get(det.tarefa_id)
      tarefaIdFiltrado = tarefa?.id || null
      grupoIdFiltrado = tarefa?.grupo_macro_id || null
      itens = [buildItemDet(det)]
    }
  } else if (filtros.tarefa_id) {
    nivel = 3
    tarefaIdFiltrado = filtros.tarefa_id
    const tarefa = tarefaPorId.get(filtros.tarefa_id)
    grupoIdFiltrado = tarefa?.grupo_macro_id || null
    const dets = detsPorTarefa.get(filtros.tarefa_id) || []
    itens = dets.map(d => buildItemDet(d))
  } else if (filtros.grupo_id) {
    nivel = 2
    grupoIdFiltrado = filtros.grupo_id
    const tarefas = tarefasPorGrupo.get(filtros.grupo_id) || []
    itens = tarefas.map(t => buildItemTarefa(t))
  } else {
    nivel = 1
    itens = grupos.map(g => buildItemGrupo(g))
  }

  // Ordenação numérica hierárquica por código
  itens.sort((a, b) => compareCodigo(a.codigo, b.codigo))

  // --------------------------------------------------------------------
  // 7) Breadcrumb
  // --------------------------------------------------------------------
  const breadcrumb: DashboardResponse['breadcrumb'] = []
  if (grupoIdFiltrado) {
    const g = grupoPorId.get(grupoIdFiltrado)
    if (g) breadcrumb.push({ id: g.id, codigo: g.codigo, nome: g.nome, nivel: 1 })
  }
  if (tarefaIdFiltrado) {
    const t = tarefaPorId.get(tarefaIdFiltrado)
    if (t) breadcrumb.push({ id: t.id, codigo: t.codigo, nome: t.nome, nivel: 2 })
  }
  if (detalhamentoIdFiltrado) {
    const d = detPorId.get(detalhamentoIdFiltrado)
    if (d) breadcrumb.push({ id: d.id, codigo: d.codigo, nome: d.descricao, nivel: 3 })
  }

  return {
    itens,
    contexto: {
      nivel,
      grupo_id: grupoIdFiltrado,
      tarefa_id: tarefaIdFiltrado,
      detalhamento_id: detalhamentoIdFiltrado,
    },
    breadcrumb,
  }
}

/**
 * Versão "por scope" do dashboard: recebe um scopeId (UUID de um grupo_macro,
 * tarefa ou detalhamento) e devolve os filhos diretos daquele nó, junto com
 * metadados do scope e breadcrumb.
 *
 * Se scopeId for null, equivale a nível 1 (todos os grupos macro).
 */
export async function getDashboardChildrenByScope(
  contratoId: string,
  scopeId: string | null,
): Promise<{
  itens: DashboardItem[]
  scope: { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null
  breadcrumb: Array<{ id: string; codigo: string; nome: string; nivel: 1 | 2 | 3 }>
}> {
  const admin = createAdminClient()
  let filtros: { grupo_id?: string; tarefa_id?: string; detalhamento_id?: string } = {}
  let scopeInfo: { id: string | null; codigo: string; nome: string; nivel: 1 | 2 | 3 | null } | null = {
    id: null,
    codigo: '',
    nome: 'Todos os grupos',
    nivel: null,
  }

  if (scopeId !== null) {
    const grupo = await admin
      .from('grupos_macro')
      .select('id, codigo, nome')
      .eq('id', scopeId)
      .maybeSingle()
    if (grupo.data) {
      filtros = { grupo_id: scopeId }
      scopeInfo = { id: scopeId, codigo: grupo.data.codigo, nome: grupo.data.nome, nivel: 1 }
    } else {
      const tarefa = await admin
        .from('tarefas')
        .select('id, codigo, nome')
        .eq('id', scopeId)
        .maybeSingle()
      if (tarefa.data) {
        filtros = { tarefa_id: scopeId }
        scopeInfo = { id: scopeId, codigo: tarefa.data.codigo, nome: tarefa.data.nome, nivel: 2 }
      } else {
        const det = await admin
          .from('detalhamentos')
          .select('id, codigo, descricao')
          .eq('id', scopeId)
          .maybeSingle()
        if (det.data) {
          filtros = { detalhamento_id: scopeId }
          scopeInfo = { id: scopeId, codigo: det.data.codigo, nome: det.data.descricao, nivel: 3 }
        } else {
          scopeInfo = null
        }
      }
    }
  }

  const result = await getDashboardData(contratoId, filtros)
  return { itens: result.itens, scope: scopeInfo, breadcrumb: result.breadcrumb }
}

/**
 * Lista TODOS os itens do contrato (grupos → tarefas → detalhamentos) em
 * ordem de árvore, com o nível de cada um. Usado pelo filtro por item e
 * pela exportação (Excel/PDF) da Visão Geral. Reaproveita o tree-walk já
 * testado de getDashboardChildrenByScope.
 */
export interface DashboardFlatItem { item: DashboardItem; level: number }

export async function getDashboardFlat(contratoId: string): Promise<DashboardFlatItem[]> {
  const out: DashboardFlatItem[] = []
  const grupos = await getDashboardChildrenByScope(contratoId, null)
  for (const g of grupos.itens) {
    out.push({ item: g, level: 0 })
    if (!g.tem_filhos) continue
    const tarefas = await getDashboardChildrenByScope(contratoId, g.id)
    for (const t of tarefas.itens) {
      out.push({ item: t, level: 1 })
      if (!t.tem_filhos) continue
      const dets = await getDashboardChildrenByScope(contratoId, t.id)
      for (const d of dets.itens) out.push({ item: d, level: 2 })
    }
  }
  return out
}
