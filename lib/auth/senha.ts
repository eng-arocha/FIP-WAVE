// Utilitários de validação de senha
// Centraliza as regras para que client e server usem a mesma lógica.

export const SENHA_PADRAO = '12345678'

/**
 * Detecta se a senha informada é a senha padrão de boas-vindas.
 * Usuários com essa senha devem ser forçados a trocar no próximo acesso.
 */
export function isSenhaPadrao(senha: string): boolean {
  return senha === SENHA_PADRAO
}

export interface RegrasSenha {
  minLength: boolean
  temMaiuscula: boolean
  temMinuscula: boolean
  temEspecial: boolean
}

export function avaliarSenha(senha: string): RegrasSenha {
  return {
    minLength:    senha.length >= 8,
    temMaiuscula: /[A-Z]/.test(senha),
    temMinuscula: /[a-z]/.test(senha),
    temEspecial:  /[^A-Za-z0-9]/.test(senha),
  }
}

export function senhaEhForte(senha: string): boolean {
  const r = avaliarSenha(senha)
  return r.minLength && r.temMaiuscula && r.temMinuscula && r.temEspecial
}

/**
 * Retorna a primeira mensagem de erro encontrada, ou null se a senha é forte.
 * Usado tanto no client quanto no server para manter a mesma mensagem.
 */
export function validarSenhaForte(senha: string): string | null {
  if (senha.length < 8)            return 'A senha deve ter pelo menos 8 caracteres.'
  if (!/[A-Z]/.test(senha))        return 'A senha deve conter pelo menos 1 letra MAIÚSCULA.'
  if (!/[a-z]/.test(senha))        return 'A senha deve conter pelo menos 1 letra minúscula.'
  if (!/[^A-Za-z0-9]/.test(senha)) return 'A senha deve conter pelo menos 1 caractere especial (ex: ! @ # $ %).'
  return null
}
