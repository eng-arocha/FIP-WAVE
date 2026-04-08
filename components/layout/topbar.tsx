'use client'

import React from 'react'
import { Bell, User } from 'lucide-react'

interface TopbarProps {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header
      className="h-14 border-b flex items-center justify-between px-4 sm:px-6 sticky top-0 z-10"
      style={{
        background: 'var(--topbar-bg)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderColor: 'rgba(0,0,0,0.08)',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {/* Title + Subtitle */}
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
          <div
            className="text-[11px] sm:text-xs leading-tight truncate max-w-[220px] sm:max-w-sm mt-0.5"
            style={{ color: 'var(--text-3)' }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
        {actions && (
          <div className="flex items-center gap-1 sm:gap-2 mr-0.5">
            {actions}
          </div>
        )}

        {/* Notification bell — 44×44 tap target */}
        <button
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all relative"
          style={{ color: 'var(--text-3)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
          onMouseLeave={e => { e.currentTarget.style.background = '' }}
          aria-label="Notificações"
        >
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
        </button>

        {/* Avatar — 44×44 tap target */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-0.5"
          style={{ background: 'linear-gradient(135deg, #0071E3, #42A5F5)' }}
          aria-label="Perfil"
        >
          <User className="w-4 h-4 text-white" strokeWidth={1.5} />
        </div>
      </div>
    </header>
  )
}
