'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAnyMaximized } from '@/lib/maximize-state'

export function EscBack() {
  const router = useRouter()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Se tem algum card/tabela maximizado, o ESC é "fechar ampliação"
      // — deixa pro handler do próprio card cuidar. Só volta de rota
      // quando nada está maximizado.
      if (e.key === 'Escape' && !isAnyMaximized()) router.back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [router])
  return null
}
