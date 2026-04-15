import { NextResponse } from 'next/server'
import { updateEmpresa } from '@/lib/db/empresas'
import { createClient } from '@/lib/supabase/server'
import { apiError } from '@/lib/api/error-response'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data, error } = await supabase.from('empresas').select('*').eq('id', id).single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const data = await updateEmpresa(id, body)
    return NextResponse.json(data)
  } catch (e: any) {
    return apiError(e)
  }
}
