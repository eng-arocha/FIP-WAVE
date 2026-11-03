// components/contratos/visao-geral/filtro-context.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DashboardModo } from '@/types/dashboard'
import type { FlatRow } from '@/lib/export/visao-geral'
import type { FiltroColuna } from '@/lib/filtro-excel'
import type { FiltrosVisaoGeral } from '@/lib/export/visao-geral-filtro'
import type { ColunaVisaoGeral } from './colunas'

/**
 * Estado dos filtros de coluna da Visão Geral, compartilhado entre a tabela
 * (cabeçalho com filtro estilo Excel) e a barra de exportação — o Excel e o
 * PDF saem com o mesmo recorte da tela.
 *
 * Os filtros ficam POR MODO: "Contratado > 100 mil" em Material não é o mesmo
 * filtro em Total. A lista plana vem de /dashboard/flat, que traz os campos dos
 * três modos de uma vez.
 */
interface Valor {
  rows: FlatRow[]
  carregando: boolean
  filtrosDo: (modo: DashboardModo) => FiltrosVisaoGeral
  definirFiltro: (modo: DashboardModo, coluna: ColunaVisaoGeral, f: FiltroColuna | null) => void
  limparFiltros: (modo: DashboardModo) => void
}

const Ctx = createContext<Valor | null>(null)

function useEstado(contratoId: string, ativo: boolean): Valor {
  const [rows, setRows] = useState<FlatRow[]>([])
  // Carregando = ainda não chegou a lista DESTE contrato (derivado, sem setState no efeito).
  const [carregadoPara, setCarregadoPara] = useState<string | null>(null)
  const carregando = ativo && carregadoPara !== contratoId
  const [filtros, setFiltros] = useState<Partial<Record<DashboardModo, FiltrosVisaoGeral>>>({})

  useEffect(() => {
    if (!ativo) return
    let vivo = true
    fetch(`/api/contratos/${contratoId}/dashboard/flat`)
      .then(r => r.ok ? r.json() : { itens: [] })
      .then(d => { if (vivo) setRows(Array.isArray(d.itens) ? d.itens : []) })
      .catch(() => { if (vivo) setRows([]) })
      .finally(() => { if (vivo) setCarregadoPara(contratoId) })
    return () => { vivo = false }
  }, [contratoId, ativo])

  const filtrosDo = useCallback((modo: DashboardModo) => filtros[modo] ?? {}, [filtros])
  const definirFiltro = useCallback((modo: DashboardModo, coluna: ColunaVisaoGeral, f: FiltroColuna | null) => {
    setFiltros(prev => {
      const doModo = { ...(prev[modo] ?? {}) }
      if (f) doModo[coluna] = f
      else delete doModo[coluna]
      return { ...prev, [modo]: doModo }
    })
  }, [])
  const limparFiltros = useCallback((modo: DashboardModo) => {
    setFiltros(prev => ({ ...prev, [modo]: {} }))
  }, [])

  return useMemo(
    () => ({ rows, carregando, filtrosDo, definirFiltro, limparFiltros }),
    [rows, carregando, filtrosDo, definirFiltro, limparFiltros],
  )
}

export function VisaoGeralFiltroProvider({ contratoId, children }: { contratoId: string; children: ReactNode }) {
  const valor = useEstado(contratoId, true)
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/** Usa o provider da página; sem ele, cada componente guarda o próprio estado. */
export function useVisaoGeralFiltro(contratoId: string): Valor {
  const ctx = useContext(Ctx)
  const local = useEstado(contratoId, ctx === null)
  return ctx ?? local
}
