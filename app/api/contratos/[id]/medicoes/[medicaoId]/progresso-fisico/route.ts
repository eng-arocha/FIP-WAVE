import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { id, medicaoId } = await params
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('medicao_progresso_fisico')
      .select(`
        id, pct_executado, valor_servico_medido, observacao,
        detalhamento:detalhamento_id(
          id, codigo, descricao, local, quantidade_contratada,
          valor_servico_unit, valor_material_unit,
          tarefa:tarefa_id(codigo, nome, grupo_macro_id)
        )
      `)
      .eq('medicao_id', medicaoId)
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  try {
    const { medicaoId } = await params
    const admin = createAdminClient()
    const { itens } = await req.json()

    if (!Array.isArray(itens)) {
      return NextResponse.json({ error: 'itens deve ser array' }, { status: 400 })
    }

    for (const item of itens) {
      if (![0, 25, 50, 75, 100].includes(item.pct_executado)) {
        return NextResponse.json({ error: `pct_executado inválido: ${item.pct_executado}` }, { status: 400 })
      }

      // Get detalhamento to compute value
      const { data: det } = await admin
        .from('detalhamentos')
        .select('quantidade_contratada, valor_servico_unit')
        .eq('id', item.detalhamento_id)
        .single()

      const valor_servico_medido = det
        ? (item.pct_executado / 100) * (det.valor_servico_unit || 0) * (det.quantidade_contratada || 1)
        : 0

      await admin
        .from('medicao_progresso_fisico')
        .upsert({
          medicao_id: medicaoId,
          detalhamento_id: item.detalhamento_id,
          pct_executado: item.pct_executado,
          valor_servico_medido,
          observacao: item.observacao,
        }, { onConflict: 'medicao_id,detalhamento_id' })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
