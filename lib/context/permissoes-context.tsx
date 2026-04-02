'use client'

import React, { createContext, useContext, useMemo } from 'react'
import type { Permissao } from '@/lib/permissoes-config'

interface PermissoesContextValue {
  permissoes: Permissao[]
  temPermissao: (modulo: string, acao: string) => boolean
}

const PermissoesContext = createContext<PermissoesContextValue>({
  permissoes: [],
  temPermissao: () => false,
})

export function PermissoesProvider({ permissoes, children }: { permissoes: Permissao[]; children: React.ReactNode }) {
  const set = useMemo(
    () => new Set(permissoes.map(p => `${p.modulo}:${p.acao}`)),
    [permissoes]
  )
  const temPermissao = useMemo(() => (modulo: string, acao: string) => set.has(`${modulo}:${acao}`), [set])
  const value = useMemo(() => ({ permissoes, temPermissao }), [permissoes, temPermissao])

  return <PermissoesContext.Provider value={value}>{children}</PermissoesContext.Provider>
}

export function usePermissoes() {
  return useContext(PermissoesContext)
}
