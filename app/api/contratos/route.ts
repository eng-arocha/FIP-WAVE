import { NextResponse } from 'next/server'
import { getContratos, createContrato } from '@/lib/db/contratos'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiError } from '@/lib/api/error-response'
import { paginate, parsePageQuery } from '@/lib/api/paginate'

/**
 * GET /api/contratos
 *
 * Retrocompatível:
 *  - Sem query params → retorna array completo (comportamento legado).
 *  - Com `?cursor=...&limit=N` → paginação keyset, retorna
 *    { rows, nextCursor, count }.
 *
 * UI nova deve sempre passar `limit`. UI antiga continua funcionando.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const usaPaginacao = url.searchParams.has('cursor') || url.searchParams.has('limit')

    if (!usaPaginacao) {
      const data = await getContratos()
      return NextResponse.json(data)
    }

    // Modo paginado (keyset por created_at)
    const { cursor, limit } = parsePageQuery(req)
    const admin = createAdminClient()
    const builder = admin
      .from('contratos')
      .select(`
        *,
        contratante:empresas!contratos_contratante_id_fkey(id, nome, cnpj),
        contratado:empresas!contratos_contratado_id_fkey(id, nome, cnpj)
      `)
    const result = await paginate(builder, {
      orderBy: 'created_at',
      dir: 'desc',
      cursor,
      limit,
      secondaryOrderBy: 'id',
    })
    return NextResponse.json(result)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const data = await createContrato(body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
