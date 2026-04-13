import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  try {
    const supabase = await createClient()

    const [{ data: grupos }, { data: medicaoItens }] = await Promise.all([
      supabase
        .from('grupos_macro')
        .select(`
          id, codigo, nome, valor_contratado, ordem,
          tarefas (
            id, codigo, nome, valor_total, ordem,
            detalhamentos (
              id, codigo, descricao, unidade, valor_total, ordem
            )
          )
        `)
        .order('ordem'),
      supabase
        .from('medicao_itens')
        .select(`valor_medido, detalhamento_id, medicao:medicoes(status)`),
    ])

    // Soma apenas itens de medições aprovadas
    const medidoByDet: Record<string, number> = {}
    for (const item of medicaoItens || []) {
      if ((item.medicao as any)?.status === 'aprovado') {
        medidoByDet[item.detalhamento_id] =
          (medidoByDet[item.detalhamento_id] || 0) + (item.valor_medido || 0)
      }
    }

    // Monta hierarquia com valor_medido em cada nível
    const hierarquia = (grupos || []).map((g: any) => {
      let grupoMedido = 0
      const tarefas = ((g.tarefas || []) as any[])
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((t: any) => {
          let tarefaMedido = 0
          const detalhamentos = ((t.detalhamentos || []) as any[])
            .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
            .map((d: any) => {
              const medido = medidoByDet[d.id] || 0
              tarefaMedido += medido
              return { ...d, valor_medido: medido }
            })
          grupoMedido += tarefaMedido
          return { ...t, valor_medido: tarefaMedido, detalhamentos }
        })
      return { ...g, valor_medido: grupoMedido, tarefas }
    })

    return NextResponse.json({ hierarquia })
  } catch (e: any) {
    return apiError(e)
  }
}
