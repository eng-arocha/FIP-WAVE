import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

/**
 * GET /api/contratos/[id]/cronograma/matriz
 *
 * Retorna árvore 3-níveis (grupo → tarefa → detalhamento) + meses + pcts no
 * nível detalhamento.
 *
 *   {
 *     grupos: [{
 *       id, codigo, nome, valor_servico, valor_material,
 *       tarefas: [{
 *         id, codigo, nome, valor_servico, valor_material,
 *         detalhamentos: [{
 *           id, codigo, descricao, quantidade_contratada,
 *           valor_material_unit, valor_servico_unit,
 *           peso_servico, peso_material    // unit × qtd
 *         }]
 *       }]
 *     }],
 *     meses: ['2026-03-01', ...],
 *     fisico:    { [det_id]: { [mes]: pct } },
 *     fatdireto: { [det_id]: { [mes]: pct } },
 *     contrato: { valor_servicos, valor_material_direto }
 *   }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const [{ data: contrato }, { data: grupos }, { data: tarefas }, { data: detalhamentos }] = await Promise.all([
      admin.from('contratos').select('data_inicio, data_fim, valor_servicos, valor_material_direto').eq('id', id).single(),
      admin.from('grupos_macro').select('id, codigo, nome, valor_servico, valor_material, ordem').eq('contrato_id', id).order('ordem'),
      admin.from('tarefas').select('id, grupo_macro_id, codigo, nome, valor_servico, valor_material, ordem').order('ordem'),
      admin.from('detalhamentos').select('id, tarefa_id, codigo, descricao, quantidade_contratada, valor_material_unit, valor_servico_unit, ordem').order('ordem'),
    ])

    const grupoIds = new Set((grupos || []).map((g: any) => g.id))
    const tarefasDoContrato = (tarefas || []).filter((t: any) => grupoIds.has(t.grupo_macro_id))
    const tarefaIds = new Set(tarefasDoContrato.map((t: any) => t.id))
    const detsDoContrato = (detalhamentos || []).filter((d: any) => tarefaIds.has(d.tarefa_id))
    const detIds = detsDoContrato.map((d: any) => d.id)

    const [{ data: planFis }, { data: planFatd }] = await Promise.all([
      detIds.length > 0
        ? admin.from('planejamento_fisico_det').select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds)
        : Promise.resolve({ data: [] as any[] } as any),
      detIds.length > 0
        ? admin.from('planejamento_fat_direto_det').select('detalhamento_id, mes, pct_planejado').in('detalhamento_id', detIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ])

    // Meses: dos planejamentos + intervalo do contrato
    const mesesSet = new Set<string>()
    ;(planFis || []).forEach((p: any) => mesesSet.add(String(p.mes).slice(0, 10)))
    ;(planFatd || []).forEach((p: any) => mesesSet.add(String(p.mes).slice(0, 10)))
    if (contrato?.data_inicio && contrato?.data_fim) {
      const start = new Date(contrato.data_inicio)
      const end = new Date(contrato.data_fim)
      const cur = new Date(start.getFullYear(), start.getMonth(), 1)
      while (cur <= end) {
        const y = cur.getFullYear()
        const m = String(cur.getMonth() + 1).padStart(2, '0')
        mesesSet.add(`${y}-${m}-01`)
        cur.setMonth(cur.getMonth() + 1)
      }
    }
    const meses = Array.from(mesesSet).sort()

    // Monta árvore
    const tarefasPorGrupo: Record<string, any[]> = {}
    for (const t of tarefasDoContrato) {
      if (!tarefasPorGrupo[t.grupo_macro_id]) tarefasPorGrupo[t.grupo_macro_id] = []
      tarefasPorGrupo[t.grupo_macro_id].push(t)
    }
    const detsPorTarefa: Record<string, any[]> = {}
    for (const d of detsDoContrato) {
      if (!detsPorTarefa[d.tarefa_id]) detsPorTarefa[d.tarefa_id] = []
      const qtd = Number(d.quantidade_contratada || 0)
      const vm = Number(d.valor_material_unit || 0)
      const vs = Number(d.valor_servico_unit || 0)
      detsPorTarefa[d.tarefa_id].push({
        id: d.id,
        codigo: d.codigo,
        descricao: d.descricao,
        quantidade_contratada: qtd,
        valor_material_unit: vm,
        valor_servico_unit: vs,
        peso_servico: qtd * vs,
        peso_material: qtd * vm,
      })
    }

    const arvore = (grupos || []).map((g: any) => ({
      id: g.id,
      codigo: g.codigo,
      nome: g.nome,
      valor_servico: Number(g.valor_servico || 0),
      valor_material: Number(g.valor_material || 0),
      tarefas: (tarefasPorGrupo[g.id] || []).map((t: any) => ({
        id: t.id,
        codigo: t.codigo,
        nome: t.nome,
        valor_servico: Number(t.valor_servico || 0),
        valor_material: Number(t.valor_material || 0),
        detalhamentos: detsPorTarefa[t.id] || [],
      })),
    }))

    const fisico: Record<string, Record<string, number>> = {}
    const fatdireto: Record<string, Record<string, number>> = {}
    for (const p of planFis || []) {
      const dId = p.detalhamento_id, mes = String(p.mes).slice(0, 10)
      if (!fisico[dId]) fisico[dId] = {}
      fisico[dId][mes] = Number(p.pct_planejado || 0)
    }
    for (const p of planFatd || []) {
      const dId = p.detalhamento_id, mes = String(p.mes).slice(0, 10)
      if (!fatdireto[dId]) fatdireto[dId] = {}
      fatdireto[dId][mes] = Number(p.pct_planejado || 0)
    }

    return NextResponse.json({
      grupos: arvore,
      meses,
      fisico,
      fatdireto,
      contrato: {
        valor_servicos: Number(contrato?.valor_servicos ?? 0),
        valor_material_direto: Number(contrato?.valor_material_direto ?? 0),
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}
