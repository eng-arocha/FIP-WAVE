import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/acompanhamento
 *
 * Returns aggregated data for the 3 tracking charts:
 * 1. Service progress (contratado vs medido) at grupo/tarefa/detalhamento level
 * 2. Fat direto approval (contratado vs approved solicitations)
 * 3. Fat direto NFs (approved vs NFs received/validated)
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // ── 1. Load grupos for this contract ──────────────────────────────────
    const { data: grupos } = await admin
      .from('grupos_macro')
      .select('id, codigo, nome, tipo_medicao, valor_contratado, valor_material, valor_servico')
      .eq('contrato_id', id)
      .order('ordem')

    const grupoIds = (grupos || []).map((g: any) => g.id)

    // ── 2. Load tarefas ───────────────────────────────────────────────────
    const { data: tarefas } = await admin
      .from('tarefas')
      .select('id, codigo, nome, grupo_macro_id, valor_total, valor_material, valor_servico')
      .in('grupo_macro_id', grupoIds)
      .order('codigo')

    const tarefaIds = (tarefas || []).map((t: any) => t.id)

    // ── 3. Load detalhamentos ─────────────────────────────────────────────
    const { data: dets } = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, local, tarefa_id, quantidade_contratada, valor_material_unit, valor_servico_unit')
      .in('tarefa_id', tarefaIds)
      .order('codigo')

    // ── 4. Load service measurement progress ──────────────────────────────
    const { data: progresso } = await admin
      .from('medicao_progresso_fisico')
      .select('detalhamento_id, pct_executado, valor_servico_medido')
      .in(
        'detalhamento_id',
        (dets || []).map((d: any) => d.id),
      )

    // Map detalhamento_id → measured value
    const medidoMap: Record<string, number> = {}
    ;(progresso || []).forEach((p: any) => {
      medidoMap[p.detalhamento_id] = (medidoMap[p.detalhamento_id] || 0) + (p.valor_servico_medido || 0)
    })

    // ── 5. Load fat direto solicitations (items level) ────────────────────
    const { data: solicitacoes } = await admin
      .from('solicitacoes_fat_direto')
      .select('id, status, valor_total')
      .eq('contrato_id', id)
      .neq('status', 'cancelado')
      .neq('status', 'rejeitado')

    const solIds = (solicitacoes || []).map((s: any) => s.id)
    const approvedSolIds = (solicitacoes || [])
      .filter((s: any) => s.status === 'aprovado')
      .map((s: any) => s.id)

    // Load items aggregated by tarefa
    const { data: itens } = solIds.length > 0
      ? await admin
          .from('itens_solicitacao_fat_direto')
          .select('tarefa_id, valor_total, solicitacao_id')
          .in('solicitacao_id', solIds)
      : { data: [] }

    // Load NFs aggregated per solicitation
    const { data: nfs } = approvedSolIds.length > 0
      ? await admin
          .from('notas_fiscais_fat_direto')
          .select('solicitacao_id, valor, status')
          .in('solicitacao_id', approvedSolIds)
      : { data: [] }

    // Map tarefa_id → { aprovado, pendente } values
    const aprovadoByTarefa: Record<string, number> = {}
    const pendenteByTarefa: Record<string, number> = {}
    const approvedSolSet = new Set(approvedSolIds)
    ;(itens || []).forEach((item: any) => {
      const key = item.tarefa_id
      if (approvedSolSet.has(item.solicitacao_id)) {
        aprovadoByTarefa[key] = (aprovadoByTarefa[key] || 0) + (item.valor_total || 0)
      } else {
        pendenteByTarefa[key] = (pendenteByTarefa[key] || 0) + (item.valor_total || 0)
      }
    })

    // Map solicitation → NF total
    const nfBySol: Record<string, number> = {}
    ;(nfs || []).forEach((nf: any) => {
      if (nf.status !== 'rejeitada') {
        nfBySol[nf.solicitacao_id] = (nfBySol[nf.solicitacao_id] || 0) + (nf.valor || 0)
      }
    })
    // Map tarefa → NF total (via approved sol items)
    const nfByTarefa: Record<string, number> = {}
    ;(itens || []).forEach((item: any) => {
      if (approvedSolSet.has(item.solicitacao_id)) {
        const nfVal = nfBySol[item.solicitacao_id] || 0
        // Pro-rate NF by item proportion within the solicitation
        // Simple approach: accumulate per tarefa
        nfByTarefa[item.tarefa_id] = (nfByTarefa[item.tarefa_id] || 0)
        // We'll use direct sol NF totals by tarefa ratio
      }
    })

    // ── 6. Build result structure ─────────────────────────────────────────
    const detsByTarefa = (dets || []).reduce((acc: Record<string, any[]>, d: any) => {
      const arr = acc[d.tarefa_id] || []
      const valor_servico = (d.valor_servico_unit || 0) * (d.quantidade_contratada || 1)
      const valor_material = (d.valor_material_unit || 0) * (d.quantidade_contratada || 1)
      arr.push({
        id: d.id,
        codigo: d.codigo,
        nome: d.descricao,
        local: d.local,
        tarefa_id: d.tarefa_id,
        valor_servico,
        valor_material,
        valor_medido_servico: medidoMap[d.id] || 0,
      })
      acc[d.tarefa_id] = arr
      return acc
    }, {})

    const tarefasByGrupo = (tarefas || []).reduce((acc: Record<string, any[]>, t: any) => {
      const arr = acc[t.grupo_macro_id] || []
      const tDets = detsByTarefa[t.id] || []
      const valor_servico_calc = tDets.reduce((s: number, d: any) => s + d.valor_servico, 0) || (t.valor_servico || 0)
      const valor_material_calc = tDets.reduce((s: number, d: any) => s + d.valor_material, 0) || (t.valor_material || 0)
      const valor_medido_servico = tDets.reduce((s: number, d: any) => s + d.valor_medido_servico, 0)
      arr.push({
        id: t.id,
        codigo: t.codigo,
        nome: t.nome,
        grupo_macro_id: t.grupo_macro_id,
        valor_servico: valor_servico_calc,
        valor_material: valor_material_calc,
        valor_medido_servico,
        valor_aprovado_fatd: aprovadoByTarefa[t.id] || 0,
        valor_pendente_fatd: pendenteByTarefa[t.id] || 0,
        detalhamentos: tDets,
      })
      acc[t.grupo_macro_id] = arr
      return acc
    }, {})

    const result = (grupos || []).map((g: any) => {
      const tars = tarefasByGrupo[g.id] || []
      const valor_servico = tars.reduce((s: number, t: any) => s + t.valor_servico, 0) || (g.valor_servico || 0)
      const valor_material = tars.reduce((s: number, t: any) => s + t.valor_material, 0) || (g.valor_material || 0)
      const valor_medido_servico = tars.reduce((s: number, t: any) => s + t.valor_medido_servico, 0)
      const valor_aprovado_fatd = tars.reduce((s: number, t: any) => s + t.valor_aprovado_fatd, 0)
      const valor_pendente_fatd = tars.reduce((s: number, t: any) => s + t.valor_pendente_fatd, 0)

      // NF total per grupo (via approved items)
      const solAprovadosNasTarefas = (itens || [])
        .filter((item: any) => tars.some((t: any) => t.id === item.tarefa_id) && approvedSolSet.has(item.solicitacao_id))
        .map((item: any) => item.solicitacao_id)
      const solSet = new Set(solAprovadosNasTarefas)
      const valor_nf_fatd = Array.from(solSet).reduce((s: number, solId: string) => s + (nfBySol[solId as string] || 0), 0)

      return {
        id: g.id,
        codigo: g.codigo,
        nome: g.nome,
        tipo_medicao: g.tipo_medicao,
        valor_contratado: g.valor_contratado,
        valor_servico,
        valor_material,
        valor_medido_servico,
        valor_aprovado_fatd,
        valor_pendente_fatd,
        valor_nf_fatd,
        tarefas: tars,
      }
    })

    // Totals for global bar
    const total = {
      valor_servico: result.reduce((s: number, g: any) => s + g.valor_servico, 0),
      valor_material: result.reduce((s: number, g: any) => s + g.valor_material, 0),
      valor_medido_servico: result.reduce((s: number, g: any) => s + g.valor_medido_servico, 0),
      valor_aprovado_fatd: result.reduce((s: number, g: any) => s + g.valor_aprovado_fatd, 0),
      valor_pendente_fatd: result.reduce((s: number, g: any) => s + g.valor_pendente_fatd, 0),
      valor_nf_fatd: result.reduce((s: number, g: any) => s + g.valor_nf_fatd, 0),
    }

    return NextResponse.json({ grupos: result, total })
  } catch (e: any) {
    return apiError(e)
  }
}
