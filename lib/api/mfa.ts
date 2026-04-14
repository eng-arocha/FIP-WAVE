import { createClient } from '@/lib/supabase/server'

/**
 * Verificação de MFA pra ações sensíveis.
 *
 * Como funciona o MFA no Supabase:
 *  - Usuário habilita TOTP via /minha-conta (precisa de UI nova).
 *  - Após login + verificação TOTP, o JWT da sessão tem o claim `aal: aal2`.
 *  - Sessão sem MFA tem `aal: aal1`.
 *
 * Esta função consulta o nível atual e retorna se o usuário satisfez o
 * requisito. Use em route handlers de aprovação (P1.10):
 *
 *   const mfa = await assertMfaForRole('admin')
 *   if (!mfa.ok) return NextResponse.json({...}, { status: 403 })
 *
 * Política sugerida:
 *   - admin     → MFA OBRIGATÓRIO
 *   - aprovador → MFA OBRIGATÓRIO
 *   - demais    → MFA opcional
 *
 * Pra ATIVAR enforcement em prod:
 *   1. Habilitar TOTP nas Auth Settings do Supabase (já é default em planos pagos)
 *   2. Adicionar UI em /minha-conta pra usuário cadastrar TOTP (próximo PR)
 *   3. Trocar o `enforce` desta lib para true via env (MFA_ENFORCED=true)
 *
 * Por que está atrás de feature flag:
 *   - Habilitar sem UI quebra acesso de admins atuais.
 *   - Permite roll-out controlado: comunica → cadastram → liga.
 */

const MFA_ENFORCED = process.env.MFA_ENFORCED === 'true'

export interface MfaCheck {
  ok: boolean
  /** Auth Assurance Level: 'aal1' = sem MFA, 'aal2' = com MFA. */
  currentLevel: 'aal1' | 'aal2' | 'unknown'
  /** Quando MFA é exigido e não foi cumprido. */
  needsMfa: boolean
  reason?: string
}

/**
 * Checa se o usuário corrente atende ao requisito de MFA para um papel.
 * Quando MFA_ENFORCED=false (default), passa sempre — útil pra não
 * quebrar prod enquanto a UI de cadastro de TOTP não existe.
 */
export async function assertMfaForRole(papel: 'admin' | 'aprovador' | 'qualquer'): Promise<MfaCheck> {
  if (!MFA_ENFORCED) {
    return { ok: true, currentLevel: 'unknown', needsMfa: false, reason: 'MFA enforcement desabilitado (MFA_ENFORCED=false).' }
  }

  if (papel === 'qualquer') {
    return { ok: true, currentLevel: 'unknown', needsMfa: false }
  }

  try {
    const supabase = await createClient()
    const { data: aalData, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error) {
      return { ok: false, currentLevel: 'unknown', needsMfa: true, reason: 'Não foi possível verificar nível MFA.' }
    }
    const current = (aalData?.currentLevel ?? 'aal1') as 'aal1' | 'aal2'
    if (current === 'aal2') {
      return { ok: true, currentLevel: current, needsMfa: false }
    }
    return {
      ok: false,
      currentLevel: current,
      needsMfa: true,
      reason: `Esta ação exige autenticação de dois fatores (MFA). Cadastre TOTP em /minha-conta.`,
    }
  } catch (e: any) {
    return { ok: false, currentLevel: 'unknown', needsMfa: true, reason: e?.message ?? 'erro MFA' }
  }
}

/** Helper de boolean simples — útil em UI. */
export async function userHasMfa(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return data?.currentLevel === 'aal2'
  } catch {
    return false
  }
}
