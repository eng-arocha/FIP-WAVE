import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermissao } from '@/lib/api/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { parseBody } from '@/lib/api/schema'
import { isSchemaMissingError } from '@/lib/db/resilient'
import { calcularInformaconData } from '@/lib/db/informacon-data'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * /api/contratos/[id]/medicoes/[medicaoId]/informakon-retrato
 *
 * Adota (POST) ou desfaz (DELETE) o retrato do Informakon NESTA medição
 * (migration 082).
 *
 * Com o retrato adotado, o boletim reclassifica de "NF Desc." para "não
 * lançada no ERP" a parcela que o Informakon não tem lançada. Isso derruba o
 * "% a lançar" na diferença exata e, na aprovação, impede que a nota seja
 * marcada como abatida — ela volta na medição seguinte.
 *
 * Só em medição ABERTA. Depois de aprovada, `nf_material_descontada` já foi
 * gravado a partir do boletim; trocar o retrato ali desalinharia o saldo
 * corrido de NF sem que nada no banco fosse recalculado. Para mexer, é
 * desfazer a aprovação primeiro.
 */

const COLUNA_082 = ['informakon_snapshot_id']

const Body = z.object({
  snapshot_id: z.string().uuid('Retrato inválido.'),
})

function migrationPendente() {
  return NextResponse.json(
    {
      error: 'Funcionalidade pendente: rode a migration 082 no Supabase.',
      code: 'MIGRATION_PENDENTE',
    },
    { status: 503 },
  )
}

/** Carrega a medição e recusa o que não pode ser alterado. */
async function medicaoAlteravel(admin: ReturnType<typeof createAdminClient>, medicaoId: string, contratoId: string) {
  const { data, error } = await admin
    .from('medicoes')
    .select('id, status, contrato_id')
    .eq('id', medicaoId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { res: NextResponse.json({ error: 'Medição não encontrada.' }, { status: 404 }) }
  const med = data as { status: string; contrato_id: string }
  if (med.contrato_id !== contratoId) {
    return { res: NextResponse.json({ error: 'Medição não pertence a este contrato.' }, { status: 404 }) }
  }
  if (med.status === 'aprovado') {
    return {
      res: NextResponse.json(
        {
          error: 'Medição já aprovada. O saldo de NF abatida foi gravado com o boletim desta medição — desfaça a aprovação antes de trocar o retrato.',
          code: 'MEDICAO_APROVADA',
        },
        { status: 409 },
      ),
    }
  }
  return { res: null }
}

/**
 * Grava e RECALCULA o boletim, devolvendo o efeito real.
 *
 * Devolver só `{ ok: true }` era o pior dos dois mundos: a chamada dava certo
 * e a tela não mudava, sem ninguém saber por quê. Recalculando aqui, a
 * resposta já diz quanto foi reclassificado — ou por que não foi.
 */
async function gravar(contratoId: string, medicaoId: string, snapshotId: string | null) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('medicoes')
    .update({ informakon_snapshot_id: snapshotId })
    .eq('id', medicaoId)
  if (error) {
    if (isSchemaMissingError(error, COLUNA_082)) return migrationPendente()
    throw error
  }

  if (!snapshotId) return NextResponse.json({ ok: true, snapshot_id: null, aplicado: false })

  const boletim = await calcularInformaconData(admin, contratoId, medicaoId)
  const efeito = boletim?.retrato_adotado ?? null
  if (!efeito || !efeito.aplicado) {
    return NextResponse.json(
      {
        error: `Retrato gravado, mas o boletim não conseguiu aplicá-lo: ${efeito?.motivo ?? 'motivo desconhecido'}. Desfaça e cole o retrato de novo.`,
        code: 'RETRATO_NAO_APLICADO',
      },
      { status: 409 },
    )
  }
  return NextResponse.json({
    ok: true,
    snapshot_id: snapshotId,
    aplicado: true,
    total_reclassificado: efeito.total_reclassificado,
    macro_itens: efeito.por_macro_item.length,
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId, medicaoId } = await params
    const parsed = await parseBody(Body, req)
    if (!parsed.ok) return parsed.res

    const admin = createAdminClient()
    const guarda = await medicaoAlteravel(admin, medicaoId, contratoId)
    if (guarda.res) return guarda.res

    // O retrato precisa existir e ser deste contrato — adotar o retrato de
    // outra obra produziria um percentual silenciosamente errado.
    const snapRes = await admin
      .from('informakon_saldo_snapshots')
      .select('id, contrato_id')
      .eq('id', parsed.data.snapshot_id)
      .maybeSingle()
    if (snapRes.error) {
      if (isSchemaMissingError(snapRes.error, ['informakon_saldo_snapshots'])) return migrationPendente()
      throw snapRes.error
    }
    if (!snapRes.data || (snapRes.data as any).contrato_id !== contratoId) {
      return NextResponse.json({ error: 'Retrato não encontrado neste contrato.' }, { status: 404 })
    }

    return await gravar(contratoId, medicaoId, parsed.data.snapshot_id)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('medicoes', 'editar')
  if (negado) return negado
  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()
    const guarda = await medicaoAlteravel(admin, medicaoId, contratoId)
    if (guarda.res) return guarda.res
    return await gravar(contratoId, medicaoId, null)
  } catch (e: any) {
    return apiError(e)
  }
}
