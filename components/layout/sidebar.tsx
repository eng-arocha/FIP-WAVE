'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Building2,
  CheckSquare,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Contratos',
    href: '/contratos',
    icon: FileText,
  },
  {
    label: 'Aprovações',
    href: '/aprovacoes',
    icon: CheckSquare,
    badge: true,
  },
  {
    label: 'Empresas',
    href: '/empresas',
    icon: Building2,
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 min-h-screen bg-[#080C14] border-r border-[#1E293B] flex flex-col relative">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-cyan-400 to-transparent" />

      {/* Logo */}
      <div className="px-5 pt-7 pb-5 border-b border-[#1E293B]">
        <div className="flex items-center gap-3">
          {/* Logo placeholder — swap for <Image> when asset arrives */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-900/40">
            <span className="text-white font-bold text-sm leading-none">FW</span>
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight gradient-text">FIP-WAVE</h1>
            <p className="text-[10px] text-[#475569] leading-tight tracking-widest uppercase">Mission Control</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group relative',
                isActive
                  ? 'bg-[#1a2236] text-white border-l-2 border-blue-500 pl-[10px]'
                  : 'text-[#475569] hover:bg-[#111827] hover:text-[#94A3B8]'
              )}
            >
              <item.icon
                className={cn(
                  'w-4 h-4 flex-shrink-0 transition-colors',
                  isActive ? 'text-blue-400' : 'text-[#475569] group-hover:text-[#94A3B8]'
                )}
              />
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-5 border-t border-[#1E293B] pt-4 space-y-1">
        {/* Status dot */}
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <span
            className="w-2 h-2 rounded-full bg-[#10B981] flex-shrink-0"
            style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
          />
          <span className="text-xs text-[#475569]">Sistema Online</span>
        </div>

        <Link
          href="/logout"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#475569] hover:text-[#94A3B8] hover:bg-[#111827] transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair do Sistema</span>
        </Link>

        <div className="px-3 pt-1">
          <p className="text-[10px] text-[#475569]/50">v1.0.0 · FIP Engenharia</p>
        </div>
      </div>
    </aside>
  )
}
