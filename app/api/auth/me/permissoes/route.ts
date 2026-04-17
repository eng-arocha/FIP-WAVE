import { NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/api/auth'
import { getPermissoesEfetivas } from '@/lib/db/permissoes'

/**
 * GET /api/auth/me/permissoes
 *
 * Retorna as permissões efetivas do usuário logado para uso em UI client-side
 * (mostrar/esconder botões, desabilitar inputs, etc.).
 *
 * Resposta:
 *   {
 *     isAdmin: boolean,
 *     fonte: 'admin' | 'customizadas' | 'template' | 'fallback' | 'nenhuma',
 *     permissoes: [{ modulo, acao }]
 *   }
 *
 * IMPORTANTE: front-end usa isso só como hint visual. A checagem REAL de
 * segurança é feita nos endpoints PATCH/POST via assertPermissao().
 */
export async function GET() {
  const user = await getUsuarioLogado()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  const { permissoes, fonte } = await getPermissoesEfetivas(user.id)
  return NextResponse.json({
    isAdmin: fonte === 'admin',
    fonte,
    permissoes,
  })
}
