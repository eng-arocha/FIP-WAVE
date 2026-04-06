'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, FileText, Building2, CheckSquare, LogOut, X, Users,
  Pin, PinOff, ChevronDown, FolderOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissoes } from '@/lib/context/permissoes-context'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador: 'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin: 'Administrador',
}

interface SidebarProps {
  perfilAtual: Perfil
  nomeAtual: string
  expanded: boolean
  pinned: boolean
  onTogglePin: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}

export function Sidebar({
  perfilAtual, nomeAtual, expanded, pinned, onTogglePin, onMouseEnter, onMouseLeave,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const { temPermissao } = usePermissoes()

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('open-mobile-sidebar', handler)
    return () => window.removeEventListener('open-mobile-sidebar', handler)
  }, [])

  // Auto-open Cadastro group when on a sub-route
  useEffect(() => {
    if (pathname.startsWith('/empresas') || pathname.startsWith('/usuarios')) {
      setCadastroOpen(true)
    }
  }, [pathname])

  const mainItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, modulo: 'dashboard' },
    { label: 'Contratos', href: '/contratos', icon: FileText, modulo: 'contratos' },
    { label: 'Aprovações', href: '/aprovacoes', icon: CheckSquare, modulo: 'aprovacoes', badge: true },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const cadastroItems = [
    { label: 'Empresas', href: '/empresas', icon: Building2, modulo: 'empresas' },
    { label: 'Usuários', href: '/usuarios', icon: Users, modulo: 'usuarios' },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const isCadastroActive = pathname.startsWith('/empresas') || pathname.startsWith('/usuarios')

  const renderNavLink = (item: any, showText: boolean, indent = false) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={!showText ? item.label : undefined}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative',
          indent && showText && 'pl-8',
          !showText && 'justify-center px-0',
          isActive ? 'text-white' : 'text-[#475569] hover:bg-[#111827] hover:text-[#94A3B8]',
        )}
        style={isActive ? {
          background: 'linear-gradient(135deg, rgba(59,130,246,0.15) 0%, rgba(6,182,212,0.07) 100%)',
        } : {}}
      >
        {isActive && showText && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-gradient-to-b from-blue-400 to-cyan-400 rounded-r-full" />
        )}
        <item.icon className={cn(
          'w-4 h-4 flex-shrink-0 transition-colors',
          isActive ? 'text-blue-400' : 'text-[#475569] group-hover:text-[#64748B]',
        )} />
        <span className={cn(
          'whitespace-nowrap transition-all duration-200 flex-1',
          showText ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
        )}>
          {item.label}
        </span>
        {'badge' in item && item.badge && showText && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
        )}
      </Link>
    )
  }

  const renderContent = (showText: boolean) => (
    <>
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-600 via-cyan-400 to-transparent" />

      {/* Header: logo + pin button */}
      <div className={cn(
        'border-b border-[#1E293B] flex items-center transition-all duration-300',
        showText ? 'px-4 py-4 justify-between' : 'px-0 py-4 justify-center',
      )}>
        {showText ? (
          <>
            <Image
              src="/logos/wave-branco.png"
              alt="WAVE Beira-Mar"
              width={130}
              height={73}
              priority
              className="object-contain rounded-lg"
              style={{ width: 'auto', height: 'auto', maxWidth: 130, maxHeight: 73 }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin() }}
              title={pinned ? 'Desafixar sidebar' : 'Fixar sidebar'}
              className="p-1.5 rounded-lg text-[#475569] hover:text-[#94A3B8] hover:bg-[#111827] transition-all flex-shrink-0 hidden lg:flex items-center"
            >
              {pinned
                ? <PinOff className="w-3.5 h-3.5" />
                : <Pin className="w-3.5 h-3.5" />}
            </button>
          </>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-500/20 flex items-center justify-center">
            <span
              className="text-xs font-bold"
              style={{ background: 'linear-gradient(90deg,#3B82F6,#06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
            >
              W
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {mainItems.map(item => renderNavLink(item, showText))}

        {/* Cadastro collapsible group */}
        {cadastroItems.length > 0 && (
          <div>
            <button
              title={!showText ? 'Cadastro' : undefined}
              onClick={() => {
                if (!showText) {
                  // Icon-only mode: navigate to first item or active one
                  const target = cadastroItems.find(i => pathname.startsWith(i.href)) ?? cadastroItems[0]
                  if (target) router.push(target.href)
                } else {
                  setCadastroOpen(v => !v)
                }
              }}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group',
                !showText && 'justify-center px-0',
                isCadastroActive
                  ? 'text-[#94A3B8]'
                  : 'text-[#475569] hover:bg-[#111827] hover:text-[#94A3B8]',
              )}
              style={isCadastroActive && !showText ? {
                background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(6,182,212,0.05))',
              } : {}}
            >
              <FolderOpen className={cn(
                'w-4 h-4 flex-shrink-0',
                isCadastroActive ? 'text-blue-400/70' : 'text-[#475569] group-hover:text-[#64748B]',
              )} />
              <span className={cn(
                'flex-1 text-left whitespace-nowrap transition-all duration-200',
                showText ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden',
              )}>
                Cadastro
              </span>
              {showText && (
                <ChevronDown className={cn(
                  'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200',
                  cadastroOpen ? '' : '-rotate-90',
                )} />
              )}
            </button>

            {/* Subitems */}
            <div className={cn(
              'overflow-hidden transition-all duration-300 ease-in-out',
              cadastroOpen && showText ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0',
            )}>
              <div className="py-0.5 ml-2 border-l border-[#1E293B]">
                {cadastroItems.map(item => renderNavLink(item, showText, true))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className={cn('border-t border-[#1E293B] pt-4 pb-5 space-y-1', showText ? 'px-3' : 'px-2')}>
        {/* User card */}
        {nomeAtual && (
          showText ? (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-lg bg-[#111827]">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-blue-400">{nomeAtual.charAt(0).toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#94A3B8] truncate">{nomeAtual}</p>
                <p className="text-[10px] text-[#475569]">{PERFIL_LABELS[perfilAtual]}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-1">
              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center" title={nomeAtual}>
                <span className="text-[10px] font-bold text-blue-400">{nomeAtual.charAt(0).toUpperCase()}</span>
              </div>
            </div>
          )
        )}

        {/* Status */}
        <div className={cn('flex items-center gap-2 px-3 py-1', !showText && 'justify-center px-0')}>
          <span
            className="w-2 h-2 rounded-full bg-[#10B981] flex-shrink-0"
            style={{ animation: 'pulse-glow 2s ease-in-out infinite' }}
            title={!showText ? 'Sistema Online' : undefined}
          />
          {showText && <span className="text-xs text-[#475569]">Sistema Online</span>}
        </div>

        {/* Logout — always visible */}
        <Link
          href="/logout"
          onClick={() => setMobileOpen(false)}
          title={!showText ? 'Sair do Sistema' : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#475569] hover:text-[#EF4444] hover:bg-red-950/20 transition-all duration-150',
            !showText && 'justify-center px-0',
          )}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {showText && <span>Sair do Sistema</span>}
        </Link>

        {showText && (
          <div className="px-3 pt-1">
            <p className="text-[10px] text-[#475569]/50">v1.0.0 · FIP Engenharia</p>
          </div>
        )}
      </div>
    </>
  )

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer — always full text */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-[#080C14] border-r border-[#1E293B] flex flex-col lg:hidden overflow-hidden',
        'transition-transform duration-300 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-1 rounded-lg text-[#475569] hover:text-[#94A3B8] hover:bg-[#111827]"
        >
          <X className="w-4 h-4" />
        </button>
        {renderContent(true)}
      </aside>

      {/* Desktop sidebar — collapses to icon strip when not pinned */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 bg-[#080C14] border-r border-[#1E293B] flex-col overflow-hidden',
          'transition-all duration-300 ease-in-out',
          'hidden lg:flex',
          expanded ? 'w-64' : 'w-14',
          // Floating shadow when overlay-expanded (not pinned)
          !pinned && expanded && 'shadow-[4px_0_40px_rgba(0,0,0,0.6)]',
        )}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {renderContent(expanded)}
      </aside>
    </>
  )
}
