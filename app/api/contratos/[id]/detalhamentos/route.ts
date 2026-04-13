import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(req.url)
    const grupoId = searchParams.get('grupo_id')

    const admin = createAdminClient()

    // Get all grupos for this contract
    let grupoQuery = admin.from('grupos_macro').select('id').eq('contrato_id', id)
    if (grupoId) grupoQuery = grupoQuery.eq('id', grupoId)
    const { data: grupos } = await grupoQuery
    const grupoIds = (grupos || []).map((g: any) => g.id)

    const { data: tarefas } = await admin
      .from('tarefas')
      .select('id')
      .in('grupo_macro_id', grupoIds)
    const tarefaIds = (tarefas || []).map((t: any) => t.id)

    const { data, error } = await admin
      .from('detalhamentos')
      .select(`
        id, codigo, descricao, local, quantidade_contratada,
        valor_servico_unit, valor_material_unit, valor_unitario,
        tarefa:tarefa_id(id, codigo, nome, grupo_macro:grupo_macro_id(id, codigo, nome))
      `)
      .in('tarefa_id', tarefaIds)
      .order('codigo')

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}
