'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { cn } from '@/lib/utils'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

interface SidebarShellProps {
  perfilAtual: Perfil
  nomeAtual: string
  children: React.ReactNode
}

export function SidebarShell({ perfilAtual, nomeAtual, children }: SidebarShellProps) {
  const [pinned, setPinned] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [mounted, setMounted] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-pinned')
    if (stored !== null) setPinned(stored === 'true')
    setMounted(true)
  }, [])

  const handleTogglePin = useCallback(() => {
    setPinned(prev => {
      const next = !prev
      localStorage.setItem('sidebar-pinned', String(next))
      if (!next) setHovered(false)
      return next
    })
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
    setHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    collapseTimer.current = setTimeout(() => setHovered(false), 450)
  }, [])

  // Before mount: default to pinned (matches SSR, avoids flicker)
  const isPinned = !mounted ? true : pinned
  const expanded = isPinned || hovered

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Spacer: pushes content right when sidebar is pinned */}
      <div
        className={cn(
          'hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out',
          isPinned ? 'w-64' : 'w-14'
        )}
      />

      <Sidebar
        perfilAtual={perfilAtual}
        nomeAtual={nomeAtual}
        expanded={expanded}
        pinned={isPinned}
        onTogglePin={handleTogglePin}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />

      {/*
        main-mobile-pad: adds bottom padding on mobile so content isn't hidden
        behind the bottom navigation bar (defined in globals.css).
      */}
      <main
        className="main-mobile-pad flex-1 flex flex-col overflow-hidden min-w-0 transition-colors duration-300"
        style={{ background: 'var(--background)' }}
      >
        {children}
      </main>
    </div>
  )
}
