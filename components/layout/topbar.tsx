'use client'

import { Bell, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TopbarProps {
  title?: string
  subtitle?: string
  actions?: React.ReactNode
}

export function Topbar({ title, subtitle, actions }: TopbarProps) {
  return (
    <header className="h-14 bg-[#0D1421]/80 backdrop-blur-sm border-b border-[#1E293B] flex items-center justify-between px-6">
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
