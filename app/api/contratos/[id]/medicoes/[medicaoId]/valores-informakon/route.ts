import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermissao } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'
import { conciliarMedicaoComInformakon } from '@/lib/db/medicao-conciliacao-informakon'
import { calcularInformaconData } from '@/lib/db/informacon-data'
import { valoresDaImportacao, valoresDoSite } from '@/lib/informakon/valores-financeiros'

/**
 * GET /api/contratos/[id]/medicoes/[medicaoId]/valores-informakon
 *
 * Insumos do bloco "Valores Financeiros do Informakon" da aprovação (spec
 * 2026-10-28): os 5 números pelo boletim do site e, quando o relatório
 * importado já tem a medição, os do Informakon para pré-preencher.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; medicaoId: string }> },
) {
  const negado = await requirePermissao('contratos', 'visualizar')
  if (negado) return negado

  try {
    const { id: contratoId, medicaoId } = await params
    const admin = createAdminClient()
    const [boletim, conciliacao] = await Promise.all([
      calcularInformaconData(admin, contratoId, medicaoId),
      conciliarMedicaoComInformakon(admin, contratoId, medicaoId),
    ])
    return NextResponse.json({
      site: boletim ? valoresDoSite(boletim.totais) : null,
      importado: conciliacao.temDados && conciliacao.informakon
        ? valoresDaImportacao(conciliacao.informakon)
        : null,
      referencia: conciliacao.referencia,
    })
  } catch (e: any) {
    return apiError(e)
  }
}
