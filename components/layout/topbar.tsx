'use client'

import React from 'react'
import { Bell, User, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopbarProps {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header
      className="h-14 border-b flex items-center justify-between px-3 sm:px-6 sticky top-0 z-10"
      style={{
        background: 'var(--topbar-bg)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderColor: 'rgba(0,0,0,0.08)',
      }}
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

      <div className="flex items-center gap-1.5 ml-2">
        {actions && <div className="flex items-center gap-1 sm:gap-2 mr-1">{actions}</div>}

        {/* Notifications */}
        <button
          className="w-8 h-8 rounded-full flex items-center justify-center transition-all relative"
          style={{ color: '#86868B' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}
        >
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0071E3, #42A5F5)' }}
        >
          <User className="w-4 h-4 text-white" strokeWidth={1.5} />
        </div>
      </div>
    </header>
  )
}
