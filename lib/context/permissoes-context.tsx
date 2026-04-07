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
  const temPermissao = useMemo(() => (modulo: string, acao: string) => set.has(`${modulo}:${acao}`), [set])
  const value = useMemo(() => ({ permissoes, temPermissao, perfilAtual }), [permissoes, temPermissao, perfilAtual])

  return <PermissoesContext.Provider value={value}>{children}</PermissoesContext.Provider>
}

export function usePermissoes() {
  return useContext(PermissoesContext)
}
