import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { parseBody, uuid } from '@/lib/api/schema'
import { detectarBreakdown, arredondarQtde, somarPavimentos } from '@/lib/medicao-breakdown'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * PATCH /api/contratos/[id]/medicoes/vaos-backfill
 *
 * Escreve pavimentos_pct no último medicao_item aprovado para um
 * detalhamento medido por breakdown. Usado para backfill histórico: medições
 * antigas submetidas com input numérico (sem breakdown) recebem o breakdown
 * retroativamente para que o estado anterior apareça corretamente na próxima
 * medição e nos PDFs.
 *
 * Body: { detalhamento_id: uuid, pavimentos_pct: Record<string, 0..100> }
 *
 * Idempotente: chamar múltiplas vezes atualiza o mesmo item.
 *
 * A rota antiga aceitava o body cru e sobrescrevia `pavimentos_pct` sem
 * olhar. Isso era tolerável enquanto o mapa só continha 0 ou 100 — hoje o
 * ajuste do admin grava qualquer % por célula, e um backfill descuidado
 * baixaria em silêncio uma célula já aprovada. Agora a rota:
 *   1. valida chaves contra o range real do detalhamento;
 *   2. mescla por MAX com o que já está gravado (nunca reduz);
 *   3. recusa um breakdown que some MAIS que o acumulado aprovado do
 *      detalhamento — o ponto inteiro do backfill é ficar consistente com ele.
 */

const Body = z.object({
  detalhamento_id: uuid(),
  pavimentos_pct: z.record(
    z.string().regex(/^\d+$/, 'Chave de breakdown inválida.'),
    z.number().min(0).max(100).finite(),
  ),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res
    const { detalhamento_id, pavimentos_pct } = parsed.data

    const admin = createAdminClient()

    // Detalhamento: precisa da descrição + qtde contratada pra saber quantas
    // células o item tem e recusar chave fora do range.
    const { data: det, error: detErr } = await admin
      .from('detalhamentos')
      .select('id, codigo, descricao, quantidade_contratada')
      .eq('id', detalhamento_id)
      .single()
    if (detErr || !det) return apiError('Detalhamento não encontrado.', { status: 404 })

    const modo = detectarBreakdown(
      (det as any).descricao,
      Number((det as any).quantidade_contratada ?? 0),
    )
    if (!modo) {
      return NextResponse.json(
        { error: `O item ${(det as any).codigo} não é medido por pavimento/vão/mês.`, code: 'SEM_BREAKDOWN' },
        { status: 400 },
      )
    }

    const validas = new Set(modo.celulas.map(c => c.chave))
    const foraDoRange = Object.keys(pavimentos_pct).filter(k => !validas.has(k))
    if (foraDoRange.length > 0) {
      return NextResponse.json(
        {
          error: `Células fora do intervalo do item ${(det as any).codigo}: ${foraDoRange.slice(0, 8).join(', ')}.`,
          code: 'BREAKDOWN_INVALIDO',
        },
        { status: 400 },
      )
    }

    // Medições aprovadas do contrato, mais recentes primeiro.
    const { data: medicoes } = await admin
      .from('medicoes')
      .select('id, numero')
      .eq('contrato_id', contratoId)
      .eq('status', 'aprovado')
      .order('numero', { ascending: false })

    if (!medicoes || medicoes.length === 0) {
      return NextResponse.json({ error: 'Nenhuma medição aprovada encontrada' }, { status: 404 })
    }

    // medicao_item mais recente com este detalhamento_id.
    for (const med of medicoes) {
      const { data: item } = await admin
        .from('medicao_itens')
        .select('id, quantidade_medida, pavimentos_pct')
        .eq('medicao_id', med.id)
        .eq('detalhamento_id', detalhamento_id)
        .maybeSingle()

      if (!item) continue

      // Merge por MAX: backfill só acrescenta histórico, nunca desmede.
      const gravado = ((item as any).pavimentos_pct as Record<string, number> | null) ?? {}
      const merged: Record<string, number> = {}
      const reduzidas: string[] = []
      for (const celula of modo.celulas) {
        const atual = Number(gravado[celula.chave] ?? 0)
        const pedido = Math.round(Number(pavimentos_pct[celula.chave] ?? 0))
        if (pedido < atual) reduzidas.push(celula.label)
        const v = Math.max(atual, Number.isFinite(pedido) ? pedido : 0)
        if (v > 0) merged[celula.chave] = Math.max(0, Math.min(100, v))
      }

      // `pavimentos_pct` guarda o ACUMULADO ao fim da medição, então o alvo
      // do backfill é a soma de `quantidade_medida` de TODAS as medições
      // aprovadas até esta — não o delta deste item isolado.
      //
      // Sem esta guarda, um backfill arredondado para cima inventa quantidade
      // na medição seguinte: o breakdown vira o piso e o delta sai dele.
      const idsAteAqui = medicoes
        .filter((m: any) => Number(m.numero) <= Number(med.numero))
        .map((m: any) => m.id as string)
      const { data: itensAcum, error: acumErr } = await admin
        .from('medicao_itens')
        .select('quantidade_medida')
        .in('medicao_id', idsAteAqui)
        .eq('detalhamento_id', detalhamento_id)
      if (acumErr) throw acumErr
      const qtdeAcumulada = arredondarQtde(
        (itensAcum || []).reduce((acc: number, r: any) => acc + Number(r.quantidade_medida || 0), 0),
      )

      const soma = arredondarQtde(somarPavimentos(merged))
      if (soma - qtdeAcumulada > 1e-6) {
        return NextResponse.json(
          {
            error:
              `O breakdown soma ${soma.toLocaleString('pt-BR')} un., acima das ` +
              `${qtdeAcumulada.toLocaleString('pt-BR')} un. acumuladas em medições aprovadas. ` +
              `Backfill não pode aumentar o histórico — reduza as células.`,
            code: 'BACKFILL_ACIMA_DO_MEDIDO',
            soma_breakdown: soma,
            qtd_acumulada: qtdeAcumulada,
          },
          { status: 409 },
        )
      }

      const { error: upErr } = await admin
        .from('medicao_itens')
        .update({ pavimentos_pct: merged })
        .eq('id', (item as any).id)
      if (upErr) throw upErr

      return NextResponse.json({
        ok: true,
        medicao_id: med.id,
        medicao_numero: med.numero,
        item_id: (item as any).id,
        pavimentos_pct: merged,
        soma_breakdown: soma,
        qtd_acumulada: qtdeAcumulada,
        /** Células que o pedido tentaria reduzir e o merge preservou. */
        preservadas: reduzidas,
      })
    }

    return NextResponse.json({ error: 'Nenhum medicao_item encontrado para este detalhamento' }, { status: 404 })
  } catch (e: any) {
    return apiError(e)
  }
}
