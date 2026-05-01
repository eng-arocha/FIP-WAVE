'use client'

import { useEffect } from 'react'

/**
 * Componente invisível que dispara o tick mensal uma vez por sessão.
 * Roda no layout (dentro do app autenticado) — quando o usuário entra
 * na app, garante que os relatórios do mês foram gerados pra todos os
 * contratos ativos. Idempotente no backend.
 */
export function RelatorioMensalTick() {
  useEffect(() => {
    const KEY = 'fipwave:relatorio-mensal-tick:last'
    try {
      const last = sessionStorage.getItem(KEY)
      const hoje = new Date().toISOString().slice(0, 10)
      if (last === hoje) return
      // Marca antes pra evitar concorrência
      sessionStorage.setItem(KEY, hoje)
      fetch('/api/cron/relatorio-mensal-tick').catch(() => {
        // Falha silenciosa — outra sessão pega na próxima
      })
    } catch {
      // sessionStorage indisponível? só dispara
      fetch('/api/cron/relatorio-mensal-tick').catch(() => {})
    }
  }, [])
  return null
}
