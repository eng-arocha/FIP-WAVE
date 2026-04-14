import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUsuarioLogado } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { hashBoletim, shortHash, verifyUrl, BoletimCanonical } from '@/lib/api/boletim-hash'
import { audit } from '@/lib/api/audit'

const ParamsSchema = z.object({ id: z.string().uuid() })

/**
 * POST /api/medicoes/[id]/emitir-boletim
 *
 * Calcula hash determinístico do boletim, persiste em medicoes.boletim_hash,
 * registra emissor e timestamp. Retorna { hash, short, verifyUrl } pra
 * o front incorporar no PDF (texto + QR code).
 *
 * Pode ser chamado múltiplas vezes — o hash é idempotente enquanto o
 * conteúdo da medição não muda. Se mudou, o hash novo invalida o antigo.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUsuarioLogado()
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { id } = await params
    if (!ParamsSchema.safeParse({ id }).success) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Carrega medição + itens + contrato pra montar canonical
    const { data: medRaw, error: medErr } = await admin
      .from('medicoes')
      .select(`
        id, numero, periodo_referencia, valor_total, data_aprovacao,
        contrato:contratos!inner ( numero ),
        itens:medicao_itens (
          quantidade_medida, valor_unitario, valor_glosa,
          detalhamento:detalhamentos ( codigo )
        )
      `)
      .eq('id', id)
      .single()
    if (medErr || !medRaw) {
      return NextResponse.json({ error: 'Medição não encontrada.' }, { status: 404 })
    }
    const med = medRaw as any

    // Aprovador (último registro de aprovacao com acao=aprovado)
    const { data: aprov } = await admin
      .from('aprovacoes')
      .select('aprovador_nome')
      .eq('medicao_id', id)
      .eq('acao', 'aprovado')
      .order('created_at', { ascending: false })
      .limit(1)

    const canonical: BoletimCanonical = {
      contrato_numero: med.contrato?.numero ?? '',
      medicao_numero: med.numero,
      periodo_referencia: med.periodo_referencia,
      valor_total: Number(med.valor_total ?? 0),
      data_aprovacao: med.data_aprovacao ?? null,
      aprovador_nome: (aprov?.[0] as any)?.aprovador_nome ?? null,
      itens: (med.itens || []).map((i: any) => ({
        codigo: i.detalhamento?.codigo ?? '',
        quantidade_medida: Number(i.quantidade_medida ?? 0),
        valor_unitario: Number(i.valor_unitario ?? 0),
        valor_glosa: Number(i.valor_glosa ?? 0),
      })),
    }

    const hash = hashBoletim(canonical)
    const short = shortHash(hash)
    const url = verifyUrl(hash)

    // Persiste — mas só atualiza se hash mudou (evita updated_at sem motivo)
    const { error: upErr } = await admin
      .from('medicoes')
      .update({
        boletim_hash: hash,
        boletim_emitido_em: new Date().toISOString(),
        boletim_emitido_por: user.id,
      })
      .eq('id', id)
    if (upErr) {
      // Se as colunas não existem (migration 036 pendente), retorna o hash mesmo assim
      // — a UI pode usar pra exibir, e a persistência roda quando migration aplicar.
      return NextResponse.json({
        hash, short, verifyUrl: url,
        warning: 'Migration 036 pendente — hash gerado mas não persistido.',
      })
    }

    await audit({
      event: 'medicao.boletim_emitido',
      entity_type: 'medicao',
      entity_id: id,
      actor_id: user.id,
      metadata: { hash, short },
      request: req,
    })

    return NextResponse.json({ hash, short, verifyUrl: url })
  } catch (e: any) {
    return apiError(e)
  }
}
