import { NextResponse } from 'next/server'
import { getGruposMacro, createGrupoMacro } from '@/lib/db/estrutura'
import { apiError } from '@/lib/api/error-response'

// Route sempre dinâmica — Next/Vercel não deve cachear: códigos mudam quando
// rodamos migrations de correção (ex: 047 renomeia 16.2.x → 16.3.x).
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const data = await getGruposMacro(id)
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = await createGrupoMacro({ ...body, contrato_id: id })
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
