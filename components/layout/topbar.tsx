'use client'

import React from 'react'
import { Bell, User, Search, Menu, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/ui/theme-provider'

interface TopbarProps {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  const { isDark, toggle } = useTheme()

  return (
    <header
      className="h-14 backdrop-blur-md border-b flex items-center justify-between px-6 sticky top-0 z-10 transition-colors duration-300"
      style={{ background: 'var(--topbar-bg)', borderColor: 'var(--border)' }}
    >
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-mobile-sidebar'))}
        className="lg:hidden p-2 rounded-xl transition-colors mr-1"
        style={{ color: 'var(--text-3)' }}
      >
        <Menu className="w-5 h-5" strokeWidth={1.5} />
      </button>

      <div className="min-w-0 flex-1">
        {title && (
          <h2
            className="font-semibold text-[15px] leading-tight flex items-center gap-2"
            style={{ color: 'var(--text-1)' }}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <div className="text-xs leading-tight truncate max-w-sm" style={{ color: 'var(--text-3)' }}>
            {subtitle}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {actions && <div className="flex items-center gap-2 mr-1">{actions}</div>}

        {/* Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all border"
          style={{ background: 'var(--surface-3)', borderColor: 'var(--border)', color: 'var(--text-3)' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-2)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-3)' }}
        >
          <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
          <span>Buscar</span>
          <kbd className="ml-1 px-1.5 py-0.5 text-[10px] rounded border" style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-3)' }}>⌘K</kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={isDark ? 'Modo Claro' : 'Modo Escuro'}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
          style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--surface-2)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'var(--surface-3)' }}
        >
          {isDark
            ? <Sun className="w-4 h-4" strokeWidth={1.5} />
            : <Moon className="w-4 h-4" strokeWidth={1.5} />}
        </button>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative rounded-xl w-8 h-8" style={{ color: 'var(--text-3)', background: 'var(--surface-3)' }}>
          <Bell className="w-4 h-4" strokeWidth={1.5} />
        </Button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-sm">
          <User className="w-4 h-4 text-white" strokeWidth={1.5} />
        </div>
      </div>
    </header>
  )
}
