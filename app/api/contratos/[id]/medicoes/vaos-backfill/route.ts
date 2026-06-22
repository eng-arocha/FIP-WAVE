import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/contratos/[id]/medicoes/vaos-backfill
 *
 * Escreve pavimentos_pct no último medicao_item aprovado para um
 * detalhamento do tipo "vão". Usado para backfill histórico: medições
 * antigas que foram submetidas com input numérico (sem breakdown) recebem
 * o breakdown retroativamente para que o estado anterior seja exibido
 * corretamente na próxima medição e nos PDFs.
 *
 * Body: { detalhamento_id: string, pavimentos_pct: Record<string, 0|100> }
 *
 * Idempotente: chamar múltiplas vezes atualiza o mesmo item.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: contratoId } = await params
    const body = await req.json()
    const { detalhamento_id, pavimentos_pct } = body as {
      detalhamento_id: string
      pavimentos_pct: Record<string, number>
    }

    if (!detalhamento_id || !pavimentos_pct || typeof pavimentos_pct !== 'object') {
      return NextResponse.json({ error: 'detalhamento_id e pavimentos_pct obrigatórios' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Busca todas as medições aprovadas do contrato, mais recentes primeiro
    const { data: medicoes } = await admin
      .from('medicoes')
      .select('id, numero')
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .order('numero', { ascending: false })

    if (!medicoes || medicoes.length === 0) {
      return NextResponse.json({ error: 'Nenhuma medição aprovada encontrada' }, { status: 404 })
    }

    // Encontra o medicao_item mais recente com este detalhamento_id
    for (const med of medicoes) {
      const { data: item } = await admin
        .from('medicao_itens')
        .select('id')
        .eq('medicao_id', med.id)
        .eq('detalhamento_id', detalhamento_id)
        .maybeSingle()

      if (item) {
        await admin
          .from('medicao_itens')
          .update({ pavimentos_pct })
          .eq('id', item.id)

        return NextResponse.json({
          ok: true,
          medicao_id: med.id,
          medicao_numero: med.numero,
          item_id: item.id,
        })
      }
    }

    return NextResponse.json({ error: 'Nenhum medicao_item encontrado para este detalhamento' }, { status: 404 })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
