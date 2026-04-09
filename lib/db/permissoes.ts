import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Permissao } from '@/lib/permissoes-config'
import { MODULOS_CONFIG, TEMPLATES } from '@/lib/permissoes-config'

export { MODULOS_CONFIG, TEMPLATES }
export type { Permissao }

// ═══════════════════════════════════════════════════════════════════════
// Novo modelo (migration 026):
//
// - perfis.permissoes_customizadas = false → permissões vêm do template
//   linkado via perfis.template_id (templates_permissao.permissoes). LIVE.
// - perfis.permissoes_customizadas = true  → permissões vêm da tabela
//   permissoes_usuario (ilha, frozen).
// - Admin (perfis.perfil = 'admin') → bypass total no assertPermissao.
//
// Todas as funções abaixo fazem fallback gracioso se as migrations 012
// (template_id) ou 026 (permissoes_customizadas) ainda não foram aplicadas.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Lê a tabela permissoes_usuario crua (ilha de customização).
 */
export async function getPermissoesUsuario(userId: string): Promise<Permissao[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('permissoes_usuario')
    .select('modulo, acao')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}

/**
 * Substitui TODAS as permissões frozen do usuário (usado quando a flag
 * permissoes_customizadas está true).
 */
export async function setPermissoesUsuario(userId: string, permissoes: Permissao[]): Promise<void> {
  const admin = createAdminClient()
  const { error: del } = await admin.from('permissoes_usuario').delete().eq('user_id', userId)
  if (del) throw del
  if (permissoes.length === 0) return
  const { error: ins } = await admin.from('permissoes_usuario').insert(
    permissoes.map(p => ({ user_id: userId, modulo: p.modulo, acao: p.acao }))
  )
  if (ins) throw ins
}

interface PerfilDoUsuario {
  perfil: string | null
  template_id: string | null
  permissoes_customizadas: boolean
}

/**
 * Busca o cabeçalho do perfil do usuário com as colunas novas. Tolera
 * colunas ausentes (se uma migration não foi aplicada, assume valores
 * conservadores).
 */
async function getPerfilHeader(userId: string): Promise<PerfilDoUsuario> {
  const admin = createAdminClient()

  // Tenta ler as 3 colunas. Se uma não existe, tenta progressivamente menos.
  let data: any = null
  let error: any = null

  const r1 = await admin
    .from('perfis')
    .select('perfil, template_id, permissoes_customizadas')
    .eq('id', userId)
    .single()
  if (!r1.error) data = r1.data
  else error = r1.error

  if (!data && /permissoes_customizadas/.test(error?.message ?? '')) {
    const r2 = await admin
      .from('perfis')
      .select('perfil, template_id')
      .eq('id', userId)
      .single()
    if (!r2.error) data = { ...r2.data, permissoes_customizadas: false }
    else error = r2.error
  }

  if (!data && /template_id/.test(error?.message ?? '')) {
    const r3 = await admin
      .from('perfis')
      .select('perfil')
      .eq('id', userId)
      .single()
    if (!r3.error) data = { ...r3.data, template_id: null, permissoes_customizadas: false }
  }

  return {
    perfil: data?.perfil ?? null,
    template_id: data?.template_id ?? null,
    permissoes_customizadas: data?.permissoes_customizadas === true,
  }
}

/**
 * Lê as permissões de um template_permissao pelo id.
 */
async function getPermissoesDoTemplate(templateId: string): Promise<Permissao[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('templates_permissao')
    .select('permissoes')
    .eq('id', templateId)
    .single()
  const arr = Array.isArray(data?.permissoes) ? (data!.permissoes as Permissao[]) : []
  return arr
}

/**
 * NOVA FUNÇÃO: resolve as permissões EFETIVAS de um usuário aplicando a
 * lógica do modelo novo:
 *
 *   1) se perfis.perfil = 'admin' → TODAS as permissões (super-admin)
 *   2) se permissoes_customizadas = true → permissoes_usuario (ilha)
 *   3) se template_id != null → templates_permissao.permissoes (live)
 *   4) fallback emergencial → TEMPLATES[perfil] hardcoded
 *   5) nada → []
 */
export async function getPermissoesEfetivas(userId: string): Promise<{
  permissoes: Permissao[]
  perfil: string | null
  template_id: string | null
  permissoes_customizadas: boolean
  fonte: 'admin' | 'customizadas' | 'template' | 'fallback' | 'nenhuma'
}> {
  const header = await getPerfilHeader(userId)

  // 1) Super-admin
  if (header.perfil === 'admin') {
    const todas = Object.entries(MODULOS_CONFIG).flatMap(([modulo, acoes]) =>
      acoes.map(acao => ({ modulo, acao }))
    )
    return { permissoes: todas, ...header, fonte: 'admin' }
  }

  // 2) Ilha de customização
  if (header.permissoes_customizadas) {
    const perms = await getPermissoesUsuario(userId).catch(() => [])
    return { permissoes: perms, ...header, fonte: 'customizadas' }
  }

  // 3) Template linkado (LIVE)
  if (header.template_id) {
    const perms = await getPermissoesDoTemplate(header.template_id).catch(() => [])
    return { permissoes: perms, ...header, fonte: 'template' }
  }

  // 4) Fallback emergencial — para usuários sem template (ambiente legado)
  if (header.perfil && header.perfil in TEMPLATES) {
    const perms = TEMPLATES[header.perfil as keyof typeof TEMPLATES] ?? []
    return { permissoes: perms, ...header, fonte: 'fallback' }
  }

  // 5) Sem perfil / sem template
  return { permissoes: [], ...header, fonte: 'nenhuma' }
}

/**
 * Permissões do usuário logado, usando o resolver novo.
 */
export async function getPermissoesDoUsuarioLogado(): Promise<Permissao[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { permissoes } = await getPermissoesEfetivas(user.id)
  return permissoes
}
