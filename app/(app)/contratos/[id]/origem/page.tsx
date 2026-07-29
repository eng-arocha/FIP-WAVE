// app/(app)/contratos/[id]/origem/page.tsx
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { OrigemSummary } from './origem-summary'
import { OrigemTable } from './origem-table'
import { getOrigemPageData } from '@/lib/db/origem'
import type { DashboardModo } from '@/types/dashboard'
import type { OrigemResponse, OrigemTipo } from '@/types/origem'

export const dynamic = 'force-dynamic'

function pickOne(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v[0]
  return undefined
}

export default async function OrigemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const sp = await searchParams

  const modoRaw = pickOne(sp.modo) ?? 'total'
  const origemRaw = pickOne(sp.origem) ?? 'realizado'
  const scopeRaw = pickOne(sp.scope)
  const from = pickOne(sp.from)

  const modo: DashboardModo = (['total', 'material', 'servico'] as const).includes(
    modoRaw as DashboardModo,
  )
    ? (modoRaw as DashboardModo)
    : 'total'
  const origem: OrigemTipo = origemRaw === 'saldo' ? 'saldo' : 'realizado'
  const scopeId =
    scopeRaw === undefined || scopeRaw === '' || scopeRaw === 'null' ? null : scopeRaw

  const backHref = from ?? `/contratos/${id}?modo=${modo}`

  let data: OrigemResponse | null = null
  let errorDigest: string | null = null
  try {
    data = await getOrigemPageData(id, modo, origem, scopeId)
  } catch (e) {
    errorDigest = String((e as { message?: string })?.message ?? 'unknown')
    console.error('[origem/page] getOrigemPageData failed', e)
  }

  if (!data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href={backHref} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
            <ChevronLeft className="w-4 h-4" /> Voltar à Visão Geral
          </Link>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-8 text-center">
          <p className="text-sm text-[var(--text-2)]">Não foi possível carregar os dados desta página.</p>
          {errorDigest && (
            <p className="mt-2 text-xs text-[var(--text-3)]">Detalhe técnico: {errorDigest}</p>
          )}
          <p className="mt-3 text-xs text-[var(--text-3)]">Tente recarregar ou volte à Visão Geral.</p>
        </div>
      </div>
    )
  }

  const titulo = `${data.origem === 'realizado' ? 'Notas' : 'Saldo'} · ${data.modo === 'material' ? 'Material' : data.modo === 'servico' ? 'Serviço' : 'Total'}`
  const escopoLabel = data.scope?.codigo
    ? `${data.scope.codigo} · ${data.scope.nome}`
    : 'Todo o contrato'

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-4 text-sm">
        <Link href={backHref} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
          <ChevronLeft className="w-4 h-4" /> Voltar à Visão Geral
        </Link>
      </div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">{titulo}</h1>
        <p className="text-xs text-[var(--text-3)] mt-1">Escopo: {escopoLabel}</p>
      </div>
      <div className="border border-[var(--border)] rounded-md overflow-hidden bg-[var(--surface-1)]">
        <OrigemSummary data={data} />
        <OrigemTable data={data} contratoId={id} />
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">
        Dica: <strong>duplo-clique</strong> em uma linha abre o pedido FAT direto ou medição de origem.
      </p>
    </div>
  )
}
