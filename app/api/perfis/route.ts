import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAdmin } from '@/lib/api/auth'
import { apiError } from '@/lib/api/error-response'

export async function GET() {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('templates_permissao')
      .select('*')
      .order('sistema', { ascending: false })
      .order('nome')
    if (error) throw error
    return NextResponse.json(data || [])
  } catch (e: any) {
    return apiError(e)
  }
}

export async function POST(req: Request) {
  if (!(await assertAdmin())) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  try {
    const { nome, descricao, permissoes } = await req.json()
    if (!nome) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('templates_permissao')
      .insert({ nome, descricao: descricao || '', permissoes: permissoes || [], sistema: false })
      .select()
      .single()
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Já existe um perfil com este nome' }, { status: 409 })
      throw error
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e: any) {
    return apiError(e)
  }
}
