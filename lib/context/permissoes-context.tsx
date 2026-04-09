'use client'

import React, { createContext, useContext, useMemo } from 'react'
import type { Permissao } from '@/lib/permissoes-config'
import { TEMPLATES } from '@/lib/permissoes-config'

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

  // Set das permissões do template padrão do perfil — usado como fallback
  // para usuários cuja tabela permissoes_usuario não foi backfillada após
  // uma migration ter adicionado novas entradas ao template.
  const templateSet = useMemo(() => {
    const perfilKey = perfilAtual as keyof typeof TEMPLATES
    const tpl = TEMPLATES[perfilKey] ?? []
    return new Set(tpl.map(p => `${p.modulo}:${p.acao}`))
  }, [perfilAtual])

  const temPermissao = useMemo(() => (modulo: string, acao: string) => {
    if (perfilAtual === 'admin') return true
    const key = `${modulo}:${acao}`
    return set.has(key) || templateSet.has(key)
  }, [set, templateSet, perfilAtual])

  const value = useMemo(() => ({ permissoes, temPermissao, perfilAtual }), [permissoes, temPermissao, perfilAtual])

  return <PermissoesContext.Provider value={value}>{children}</PermissoesContext.Provider>
}

export function usePermissoes() {
  return useContext(PermissoesContext)
}
