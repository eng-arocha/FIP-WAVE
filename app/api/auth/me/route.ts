import { NextResponse } from 'next/server'
import { getPerfilDoUsuarioLogado } from '@/lib/db/usuarios'

// GET /api/auth/me
// Retorna o perfil do usuário logado (nome, email, perfil, ativo).
export async function GET() {
  const perfil = await getPerfilDoUsuarioLogado()
  if (!perfil) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }
  return NextResponse.json(perfil)
}
