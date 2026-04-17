import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/estrutura-metrics
 *
 * Retorna métricas financeiras consolidadas por detalhamento/tarefa/grupo,
 * para enriquecer a aba Estrutura do contrato logo abaixo do TOTAL:
 *   - servico_medido: soma medicao_itens.valor_medido em medições aprovadas
 *   - fat_aprovados : soma itens_solicitacao_fat_direto.valor_total em solicitações aprovadas
 *   - nfs_lancadas  : soma notas_fiscais.valor emitidas nas medições que tocam o item
 *   - saldo_material: subtotal_material − fat_aprovados
 *   - saldo_servico : subtotal_mo − servico_medido
 *
 * NFs no nível de detalhamento: as notas são ligadas a medicao_id (sem link direto
 * ao item), então a métrica é a soma das NFs distintas das medições aprovadas em
 * que o item foi medido. Pode repetir quando uma NF cobre vários itens/tarefas,
 * mas serve como indicador de faturamento associado ao escopo.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // 1) Estrutura: todos detalhamentos do contrato (id, subtotais, tarefa, grupo)
    const { data: detsRaw, error: detErr } = await admin
      .from('detalhamentos')
      .select(`
        id,
        quantidade_contratada,
        valor_material_unit,
        valor_servico_unit,
        subtotal_material,
        subtotal_mo,
        valor_total,
        tarefa:tarefas!inner (
          id,
          grupo_macro_id,
          grupo:grupos_macro!inner ( id, contrato_id )
        )
      `)
      .eq('tarefa.grupo.contrato_id', id)
    if (detErr) throw detErr
    const dets = (detsRaw || []) as any[]

    // 2) Medição: valor_medido de medicao_itens em medicoes APROVADAS
    const { data: miRaw } = await admin
      .from('medicao_itens')
      .select(`
        detalhamento_id, valor_medido, medicao_id,
        medicao:medicoes!inner ( id, contrato_id, status, tipo )
      `)
      .eq('medicao.contrato_id', id)
      .eq('medicao.status', 'aprovado')
    const mItens = (miRaw || []) as any[]

    // 3) Fat. Aprovados: itens das solicitações APROVADAS não deletadas
    const { data: fatRaw } = await admin
      .from('itens_solicitacao_fat_direto')
      .select(`
        detalhamento_id, valor_total,
        solicitacao:solicitacoes_fat_direto!inner ( id, contrato_id, status, deletado_em )
      `)
      .eq('solicitacao.contrato_id', id)
      .eq('solicitacao.status', 'aprovado')
      .is('solicitacao.deletado_em', null)
    const fatItens = (fatRaw || []) as any[]

    // 4) NFs lançadas: via medicoes do contrato
    const { data: nfsRaw } = await admin
      .from('notas_fiscais')
      .select(`
        id, valor, medicao_id,
        medicao:medicoes!inner ( id, contrato_id )
      `)
      .eq('medicao.contrato_id', id)
    const nfs = (nfsRaw || []) as any[]

    // Index: medicao_id -> total NFs dessa medição
    const nfsPorMedicao: Record<string, number> = {}
    for (const nf of nfs) {
      const v = Number(nf.valor || 0)
      nfsPorMedicao[nf.medicao_id] = (nfsPorMedicao[nf.medicao_id] || 0) + v
    }

    // Agrega por detalhamento
    const servMedidoDet: Record<string, number> = {}
    const medicoesPorDet: Record<string, Set<string>> = {}
    for (const it of mItens) {
      const detId = it.detalhamento_id
      if (!detId) continue
      servMedidoDet[detId] = (servMedidoDet[detId] || 0) + Number(it.valor_medido || 0)
      if (!medicoesPorDet[detId]) medicoesPorDet[detId] = new Set()
      medicoesPorDet[detId].add(it.medicao_id)
    }
    const fatAprovDet: Record<string, number> = {}
    for (const it of fatItens) {
      const detId = it.detalhamento_id
      if (!detId) continue
      fatAprovDet[detId] = (fatAprovDet[detId] || 0) + Number(it.valor_total || 0)
    }

    type M = { servico_medido: number; fat_aprovados: number; nfs_lancadas: number; saldo_material: number; saldo_servico: number }
    const detalhamentos: Record<string, M> = {}
    const tarefas: Record<string, M> = {}
    const grupos: Record<string, M> = {}
    const nfsMedicoesGrupo: Record<string, Set<string>> = {}
    const nfsMedicoesTarefa: Record<string, Set<string>> = {}

    function ensure(map: Record<string, M>, key: string): M {
      if (!map[key]) map[key] = { servico_medido: 0, fat_aprovados: 0, nfs_lancadas: 0, saldo_material: 0, saldo_servico: 0 }
      return map[key]
    }

    for (const d of dets) {
      const tId = d.tarefa?.id
      const gId = d.tarefa?.grupo?.id
      const qtd = Number(d.quantidade_contratada || 0)
      const prMat = Number(d.valor_material_unit || 0)
      const prMo = Number(d.valor_servico_unit || 0)
      const subMat = Number(d.subtotal_material ?? qtd * prMat)
      const subMo = Number(d.subtotal_mo ?? qtd * prMo)
      const servMedido = servMedidoDet[d.id] || 0
      const fatAprov = fatAprovDet[d.id] || 0
      const saldoMat = subMat - fatAprov
      const saldoServ = subMo - servMedido
      const medIds = medicoesPorDet[d.id] || new Set<string>()
      let nfsDet = 0
      medIds.forEach(mid => { nfsDet += nfsPorMedicao[mid] || 0 })

      detalhamentos[d.id] = {
        servico_medido: servMedido,
        fat_aprovados: fatAprov,
        nfs_lancadas: nfsDet,
        saldo_material: saldoMat,
        saldo_servico: saldoServ,
      }

      if (tId) {
        const t = ensure(tarefas, tId)
        t.servico_medido += servMedido
        t.fat_aprovados  += fatAprov
        t.saldo_material += saldoMat
        t.saldo_servico  += saldoServ
        if (!nfsMedicoesTarefa[tId]) nfsMedicoesTarefa[tId] = new Set()
        medIds.forEach(mid => nfsMedicoesTarefa[tId].add(mid))
      }
      if (gId) {
        const g = ensure(grupos, gId)
        g.servico_medido += servMedido
        g.fat_aprovados  += fatAprov
        g.saldo_material += saldoMat
        g.saldo_servico  += saldoServ
        if (!nfsMedicoesGrupo[gId]) nfsMedicoesGrupo[gId] = new Set()
        medIds.forEach(mid => nfsMedicoesGrupo[gId].add(mid))
      }
    }

    // NFs em grupo/tarefa: soma NFs distintas das medições que tocam o nível
    for (const [gId, medSet] of Object.entries(nfsMedicoesGrupo)) {
      let total = 0
      medSet.forEach(mid => { total += nfsPorMedicao[mid] || 0 })
      if (grupos[gId]) grupos[gId].nfs_lancadas = total
    }
    for (const [tId, medSet] of Object.entries(nfsMedicoesTarefa)) {
      let total = 0
      medSet.forEach(mid => { total += nfsPorMedicao[mid] || 0 })
      if (tarefas[tId]) tarefas[tId].nfs_lancadas = total
    }

    return NextResponse.json({ detalhamentos, tarefas, grupos })
  } catch (e: any) {
    return apiError(e)
  }
}
