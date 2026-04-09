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

/**
 * Gera uma senha forte aleatória de 12 caracteres garantindo:
 * - 1 letra maiúscula
 * - 1 letra minúscula
 * - 1 dígito
 * - 1 caractere especial
 * Evita caracteres ambíguos (O, 0, I, l, 1) para facilitar a digitação.
 */
export function gerarSenhaForte(tamanho = 12): string {
  const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'  // sem I, O
  const MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz'   // sem l, o
  const DIGITOS    = '23456789'                   // sem 0, 1
  const ESPECIAIS  = '!@#$%&*?+-'

  const rand = (str: string) => str[Math.floor(Math.random() * str.length)]

  // Garante ao menos 1 de cada categoria
  const obrigatorios = [
    rand(MAIUSCULAS),
    rand(MINUSCULAS),
    rand(DIGITOS),
    rand(ESPECIAIS),
  ]

  const todos = MAIUSCULAS + MINUSCULAS + DIGITOS + ESPECIAIS
  const restante = Array.from({ length: Math.max(0, tamanho - obrigatorios.length) }, () => rand(todos))

  // Embaralha (Fisher-Yates)
  const arr = [...obrigatorios, ...restante]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}
