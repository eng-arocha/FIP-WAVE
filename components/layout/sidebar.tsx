'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  FileText,
  Building2,
  CheckSquare,
  LogOut,
  X,
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
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('open-mobile-sidebar', handler)
    return () => window.removeEventListener('open-mobile-sidebar', handler)
  }, [])

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={cn(
        "w-64 min-h-screen bg-[#080C14] border-r border-[#1E293B] flex flex-col relative transition-transform duration-300 ease-in-out fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-cyan-400 to-transparent" />

      {/* Mobile close button */}
      <button
        onClick={() => setMobileOpen(false)}
        className="absolute top-4 right-4 lg:hidden p-1 rounded-lg text-[#475569] hover:text-[#94A3B8] hover:bg-[#111827]"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Logo */}
      <div className="px-4 pt-6 pb-4 border-b border-[#1E293B] flex items-center justify-center">
        <Image
          src="/logos/Wave.png"
          alt="WAVE Beira-Mar"
          width={160}
          height={90}
          priority
          className="object-contain"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
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
          onClick={() => setMobileOpen(false)}
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
    </>
  )
}
