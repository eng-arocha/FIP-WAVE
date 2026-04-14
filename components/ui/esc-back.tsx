'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { isAnyMaximized } from '@/lib/maximize-state'

/**
 * Rotas "raiz" nas quais o ESC NÃO deve disparar router.back().
 *
 * Motivo: o dashboard é a landing page logo após o login. Se o usuário
 * apertar ESC ali, o router.back() tenta sair do app (volta pra tela de
 * login ou pro histórico externo do browser). Bloqueamos pra evitar que
 * o usuário saia da aplicação acidentalmente.
 */
const ESC_BACK_ROOT_ROUTES = ['/dashboard']

export function EscBack() {
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Se tem algum card/tabela maximizado, o ESC é "fechar ampliação"
      // — deixa pro handler do próprio card cuidar.
      if (isAnyMaximized()) return
      // Em rotas raiz (ex: /dashboard), ESC não volta pra evitar sair
      // do app acidentalmente.
      if (ESC_BACK_ROOT_ROUTES.includes(pathname || '')) return
      router.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router, pathname])
  return null
}
