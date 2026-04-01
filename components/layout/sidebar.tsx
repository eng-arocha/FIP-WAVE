'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Building2,
  ClipboardCheck,
  CheckSquare,
  Settings,
  ChevronRight,
  Hammer,
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
    <aside className="w-64 min-h-screen bg-[#1e3a5f] text-white flex flex-col">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">FIP-WAVE</h1>
            <p className="text-xs text-white/60 leading-tight">Controle de Medições</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className={cn('w-4.5 h-4.5 flex-shrink-0', isActive ? 'text-white' : 'text-white/60 group-hover:text-white')} />
              <span className="flex-1">{item.label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <Link
          href="/configuracoes"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Configurações</span>
        </Link>
        <div className="mt-3 px-3 py-2">
          <p className="text-xs text-white/40">v1.0.0 · FIP Engenharia</p>
        </div>
      </div>
    </aside>
  )
}
