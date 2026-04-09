'use client'

import React, { createContext, useContext, useMemo } from 'react'
import type { Permissao } from '@/lib/permissoes-config'

interface PermissoesContextValue {
  permissoes: Permissao[]
  temPermissao: (modulo: string, acao: string) => boolean
  perfilAtual: string
}

const PermissoesContext = createContext<PermissoesContextValue>({
  permissoes: [],
  temPermissao: () => false,
  perfilAtual: 'visualizador',
})

/**
 * Provider com as permissões EFETIVAS já resolvidas no servidor
 * (via getPermissoesEfetivas em lib/db/permissoes.ts).
 *
 * Lógica cliente:
 *   - admin → sempre true
 *   - outros → permissão precisa estar no set recebido do servidor
 *
 * Não faz fallback para TEMPLATES hardcoded aqui: o servidor é a
 * única fonte de verdade e já aplicou a resolução correta.
 */
export function PermissoesProvider({
  permissoes,
  perfilAtual = 'visualizador',
  children,
}: {
  permissoes: Permissao[]
  perfilAtual?: string
  children: React.ReactNode
}) {
  const set = useMemo(
    () => new Set(permissoes.map(p => `${p.modulo}:${p.acao}`)),
    [permissoes]
  )

  const temPermissao = useMemo(() => (modulo: string, acao: string) => {
    if (perfilAtual === 'admin') return true
    return set.has(`${modulo}:${acao}`)
  }, [set, perfilAtual])

  const value = useMemo(() => ({ permissoes, temPermissao, perfilAtual }), [permissoes, temPermissao, perfilAtual])

  return <PermissoesContext.Provider value={value}>{children}</PermissoesContext.Provider>
}

export function usePermissoes() {
  return useContext(PermissoesContext)
}
