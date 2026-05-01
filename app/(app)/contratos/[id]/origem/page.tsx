// app/(app)/contratos/[id]/origem/page.tsx
import { headers } from 'next/headers'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { OrigemSummary } from './origem-summary'
import { OrigemTable } from './origem-table'
import type { OrigemResponse } from '@/types/origem'

export const dynamic = 'force-dynamic'

async function fetchOrigem(contratoId: string, search: URLSearchParams): Promise<OrigemResponse | null> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const base = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? ''
  const url = `${base}/api/contratos/${contratoId}/origem?${search.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  return res.json()
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
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') search.set(k, v)
    else if (Array.isArray(v) && v[0]) search.set(k, v[0])
  }
  if (!search.get('modo')) search.set('modo', 'total')
  if (!search.get('origem')) search.set('origem', 'realizado')

  const from = search.get('from')
  const data = await fetchOrigem(id, search)
  const backHref = from ?? `/contratos/${id}?modo=${search.get('modo')}`

  if (!data) {
    return (
      <div className="p-6">
        <Link href={backHref} className="text-sm text-[var(--accent-1)] hover:underline">← Voltar</Link>
        <p className="mt-4 text-sm text-[var(--text-3)]">Não foi possível carregar os dados.</p>
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
        <Link href={backHref} className="inline-flex items-center gap-1 text-[var(--accent-1)] hover:underline">
          <ChevronLeft className="w-4 h-4" /> Voltar à Visão Geral
        </Link>
      </div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[var(--text-1)]">{titulo}</h1>
        <p className="text-xs text-[var(--text-3)] mt-1">Escopo: {escopoLabel}</p>
      </div>
      <div className="border border-[var(--border-1)] rounded-md overflow-hidden bg-[var(--surface-1)]">
        <OrigemSummary data={data} />
        <OrigemTable data={data} contratoId={id} />
      </div>
      <p className="mt-3 text-xs text-[var(--text-3)]">
        Dica: <strong>duplo-clique</strong> em uma linha abre o pedido FAT direto ou medição de origem.
      </p>
    </div>
  )
}
