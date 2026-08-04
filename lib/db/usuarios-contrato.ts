/**
 * Helpers pra trabalhar com o vínculo usuário ↔ contrato.
 * Tabela: usuarios_contratos (criada na migration 023).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface UsuarioAtrelado {
  id: string
  nome: string | null
  email: string
  perfil: string | null
}

/**
 * Lista todos os usuários atrelados a um contrato.
 * Usado pra CC automático em emails de autorização e reenvios.
 *
 * Opcionalmente filtra por um email específico (pra evitar mandar
 * CC pra ele se já for destinatário principal).
 */
export async function listarUsuariosAtreladosAoContrato(
  contratoId: string,
  opts: { excluirEmail?: string | null } = {},
): Promise<UsuarioAtrelado[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('usuarios_contratos')
    .select(`
      usuario_id,
      perfis:usuario_id ( id, nome, email, perfil )
    `)
    .eq('contrato_id', contratoId)

  if (error || !data) return []

  const excluir = (opts.excluirEmail || '').toLowerCase()
  const out: UsuarioAtrelado[] = []
  for (const row of data as any[]) {
    const p = row.perfis
    if (!p?.email) continue
    if (excluir && p.email.toLowerCase() === excluir) continue
    out.push({
      id: p.id,
      nome: p.nome ?? null,
      email: p.email,
      perfil: p.perfil ?? null,
    })
  }
  return out
}

/**
 * Retorna só os emails dos usuários atrelados ao contrato
 * (formato pronto pra usar no CC do sendEmail).
 */
export async function emailsCcDoContrato(
  contratoId: string,
  opts: { excluirEmail?: string | null } = {},
): Promise<string[]> {
  const usuarios = await listarUsuariosAtreladosAoContrato(contratoId, opts)
  return usuarios.map(u => u.email)
}

/**
 * True se o usuário pode ATUAR sobre este contrato: admin (vê e opera todos)
 * ou usuário com vínculo em `usuarios_contratos`.
 *
 * É a mesma regra de visibilidade de `/api/auth/meus-contratos` — quem
 * enxerga o contrato pode abrir solicitações nele. Serve pra ações onde o
 * usuário apenas PEDE algo que um aprovador decide depois; nesses casos exigir
 * permissão de edição é forte demais (o Engenheiro FIP levava
 * "Sem permissão para editar em contratos" ao solicitar encerramento de saldo,
 * embora quem autoriza seja o admin).
 */
export async function usuarioPodeAtuarNoContrato(
  usuarioId: string,
  contratoId: string,
): Promise<boolean> {
  const admin = createAdminClient()

  const { data: perfil } = await admin
    .from('perfis')
    .select('perfil')
    .eq('id', usuarioId)
    .maybeSingle()
  if ((perfil as any)?.perfil === 'admin') return true

  const { data: vinculo } = await admin
    .from('usuarios_contratos')
    .select('contrato_id')
    .eq('usuario_id', usuarioId)
    .eq('contrato_id', contratoId)
    .maybeSingle()

  return !!vinculo
}
