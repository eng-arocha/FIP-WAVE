import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

const STATUS_EM_APROVACAO = ['submetido', 'em_analise', 'autorizado']

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

    // `valor_medido` soma apenas itens de medições aprovadas.
    // `valor_medido_pendente` soma os de medições enviadas e ainda não
    // aprovadas — só é exibido quando a simulação do dashboard está ligada.
    const medidoByDet: Record<string, number> = {}
    const pendenteByDet: Record<string, number> = {}
    for (const item of medicaoItens || []) {
      const st = (item.medicao as any)?.status
      if (st === 'aprovado') {
        medidoByDet[item.detalhamento_id] =
          (medidoByDet[item.detalhamento_id] || 0) + (item.valor_medido || 0)
      } else if (STATUS_EM_APROVACAO.includes(st)) {
        pendenteByDet[item.detalhamento_id] =
          (pendenteByDet[item.detalhamento_id] || 0) + (item.valor_medido || 0)
      }
    }

    // Monta hierarquia com valor_medido em cada nível
    const hierarquia = (grupos || []).map((g: any) => {
      let grupoMedido = 0
      let grupoPendente = 0
      const tarefas = ((g.tarefas || []) as any[])
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((t: any) => {
          let tarefaMedido = 0
          let tarefaPendente = 0
          const detalhamentos = ((t.detalhamentos || []) as any[])
            .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
            .map((d: any) => {
              const medido = medidoByDet[d.id] || 0
              const pendente = pendenteByDet[d.id] || 0
              tarefaMedido += medido
              tarefaPendente += pendente
              return { ...d, valor_medido: medido, valor_medido_pendente: pendente }
            })
          grupoMedido += tarefaMedido
          grupoPendente += tarefaPendente
          return { ...t, valor_medido: tarefaMedido, valor_medido_pendente: tarefaPendente, detalhamentos }
        })
      return { ...g, valor_medido: grupoMedido, valor_medido_pendente: grupoPendente, tarefas }
    })

    return NextResponse.json({ hierarquia })
  } catch (e: any) {
    return apiError(e)
  }
}
