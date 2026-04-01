'use client'

import { Bell, User, Search, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopbarProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="h-14 bg-[#0D1421]/80 backdrop-blur-sm border-b border-[#1E293B] flex items-center justify-between px-6">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-mobile-sidebar'))}
        className="lg:hidden p-2 rounded-lg text-[#475569] hover:text-[#94A3B8] hover:bg-[#1a2236] transition-colors mr-1"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div>
        {title && (
          <h2 className="font-bold text-[#F1F5F9] text-base leading-tight">{title}</h2>
        )}
        {subtitle && (
          <p className="text-xs text-[#475569] leading-tight">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-[#475569] border border-[#1E293B] hover:border-[#2d3f5c] hover:text-[#94A3B8] transition-all"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar</span>
          <kbd className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#1a2236] rounded border border-[#2d3f5c]">⌘K</kbd>
        </button>
        <Button variant="ghost" size="icon" className="relative text-[#475569] hover:text-[#94A3B8]">
          <Bell className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  )
}
