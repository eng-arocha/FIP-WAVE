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
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div>
        {title && <h2 className="font-semibold text-gray-900 text-base leading-tight">{title}</h2>}
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
        </Button>
        <div className="w-8 h-8 bg-[#1e3a5f] rounded-full flex items-center justify-center">
          <User className="w-4 h-4 text-white" />
        </div>
      </div>
    </header>
  )
}
