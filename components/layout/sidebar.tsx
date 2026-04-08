'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, FileText, Building2, CheckSquare, LogOut, X, Users,
  Pin, PinOff, ChevronDown, FolderOpen, TrendingUp, Receipt, ClipboardList, FileArchive, Shield, Wrench, BookOpen, MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissoes } from '@/lib/context/permissoes-context'
import { useTheme } from '@/components/ui/theme-provider'

type Perfil = 'visualizador' | 'engenheiro_fip' | 'admin'

const PERFIL_LABELS: Record<Perfil, string> = {
  visualizador: 'Visualizador',
  engenheiro_fip: 'Engenheiro FIP',
  admin: 'Administrador',
}

// Apple-style icon configs: each nav item has its own gradient color
const ICON_COLORS: Record<string, { from: string; to: string }> = {
  '/dashboard':    { from: '#3B82F6', to: '#06B6D4' },  // blue → cyan
  '/contratos':    { from: '#8B5CF6', to: '#A855F7' },  // purple
  '/contratos/novo': { from: '#8B5CF6', to: '#A855F7' },  // purple
  '/aprovacoes':   { from: '#F59E0B', to: '#EF4444' },  // amber → red
  '/nf-fat-direto': { from: '#06B6D4', to: '#0EA5E9' }, // cyan → sky
  '/empresas':     { from: '#10B981', to: '#059669' },  // green
  '/usuarios':     { from: '#6366F1', to: '#8B5CF6' },  // indigo → purple
  '/perfis':       { from: '#F59E0B', to: '#EF4444' },  // amber → red
  '/admin':        { from: '#6B7280', to: '#4B5563' },  // gray
  '/documentos/faturamento-direto': { from: '#EF4444', to: '#F97316' },  // red → orange
  'cadastro':      { from: '#64748B', to: '#475569' },  // slate (group)
  'docs-group':    { from: '#EF4444', to: '#F97316' },  // red → orange (group)
  'cronograma':    { from: '#059669', to: '#10B981' },  // green
  'fat-direto':    { from: '#F59E0B', to: '#FB923C' },  // amber → orange
  'medicoes':      { from: '#6366F1', to: '#3B82F6' },  // indigo → blue
  'documentos':    { from: '#EC4899', to: '#F43F5E' },  // pink → rose
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
  const { isDark } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cadastroOpen, setCadastroOpen] = useState(false)
  const [contratoOpen, setContratoOpen] = useState(true)
  const [docsOpen, setDocsOpen] = useState(false)

  // Detect if inside a specific contract (extract UUID from pathname)
  const contratoMatch = pathname.match(/^\/contratos\/([a-f0-9-]{36})/)
  const contratoId = contratoMatch?.[1] ?? null
  const isInContrato = !!contratoId
  const { temPermissao } = usePermissoes()

  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener('open-mobile-sidebar', handler)
    return () => window.removeEventListener('open-mobile-sidebar', handler)
  }, [])

  useEffect(() => {
    if (pathname.startsWith('/empresas') || pathname.startsWith('/usuarios') || pathname.startsWith('/perfis') || pathname.startsWith('/admin')) {
      setCadastroOpen(true)
    }
    if (pathname.startsWith('/documentos')) {
      setDocsOpen(true)
    }
  }, [pathname])

  const mainItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, modulo: 'dashboard' },
    { label: 'Contratos', href: '/contratos', icon: FileText, modulo: 'contratos' },
    { label: 'Aprovações', href: '/aprovacoes', icon: CheckSquare, modulo: 'aprovacoes', badge: true },
    { label: 'NF Fat. Direto', href: '/nf-fat-direto', icon: Receipt, modulo: 'contratos' },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const cadastroItems = [
    ...(perfilAtual === 'admin' ? [{ label: 'Novo Contrato', href: '/contratos/novo', icon: FileText, modulo: 'contratos' }] : []),
    { label: 'Empresas', href: '/empresas', icon: Building2, modulo: 'empresas' },
    { label: 'Usuários', href: '/usuarios', icon: Users, modulo: 'usuarios' },
    { label: 'Perfis', href: '/perfis', icon: Shield, modulo: 'perfis' },
    ...(perfilAtual === 'admin' ? [{ label: 'Sistema', href: '/admin', icon: Wrench, modulo: 'usuarios' }] : []),
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const documentosItems = [
    { label: 'Pedidos FD',    href: '/documentos/faturamento-direto', icon: FileArchive,   modulo: 'documentos' },
    { label: 'Med. Serviços', href: '/documentos/medicoes-servico',   icon: ClipboardList, modulo: 'documentos' },
  ].filter(item => temPermissao(item.modulo, 'visualizar'))

  const isCadastroActive = pathname.startsWith('/empresas') || pathname.startsWith('/usuarios') || pathname.startsWith('/perfis') || pathname.startsWith('/admin')
  const isDocsActive = pathname.startsWith('/documentos')

  // Contract contextual items (shown when inside /contratos/[id])
  const contratoSubItems = contratoId ? [
    { label: 'Documentos',    href: `/contratos/${contratoId}/documentos`, icon: FileArchive,  colorKey: 'documentos' },
  ] : []

  // Apple iOS icon container — active items get a colored gradient pill
  const AppleIconBg = ({ colorKey, children }: { colorKey: string; children: React.ReactNode }) => {
    const colors = ICON_COLORS[colorKey]
    if (!colors) return <>{children}</>
    return (
      <span className="apple-icon flex-shrink-0" style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}>
        {children}
      </span>
    )
  }

  const renderNavLink = (item: any, showText: boolean, indent = false) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const colorLookup = item.colorKey ?? item.href
    const colors = ICON_COLORS[colorLookup] ?? ICON_COLORS[item.href]

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setMobileOpen(false)}
        title={!showText ? item.label : undefined}
        className={cn(
          'flex items-center gap-2.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 group relative',
          showText ? (indent ? 'px-2 pl-3' : 'px-2') : 'px-0 justify-center',
        )}
        style={isActive && showText ? {
          background: 'rgba(0,0,0,0.04)',
        } : {}}
        onMouseEnter={e => {
          if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'
        }}
        onMouseLeave={e => {
          if (!isActive) e.currentTarget.style.background = ''
        }}
      >
        {colors ? (
          <span
            className="apple-icon flex-shrink-0 transition-all duration-200"
            style={{
              background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
              opacity: isActive ? 1 : 0.55,
              boxShadow: isActive ? `0 2px 8px ${colors.from}40` : 'none',
            }}
          >
            <item.icon className="w-3.5 h-3.5 text-white" strokeWidth={1.5} />
          </span>
        ) : (
          <span className="apple-icon flex-shrink-0" style={{ background: 'var(--surface-3)' }}>
            <item.icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: 'var(--text-3)' }} />
          </span>
        )}

        <span
          className={cn('whitespace-nowrap transition-all duration-200 flex-1', showText ? 'opacity-100' : 'opacity-0 w-0 overflow-hidden')}
          style={{ color: isActive ? 'var(--text-1)' : 'var(--text-2)', fontWeight: isActive ? 600 : 400 }}
        >
          {item.label}
        </span>

        {'badge' in item && item.badge && showText && (
          <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        )}

        {isActive && showText && (
          <span className="absolute right-2 w-1.5 h-1.5 rounded-full" style={{ background: colors?.from ?? 'var(--accent)' }} />
        )}
      </Link>
    )
  }

  const renderContent = (showText: boolean) => (
    <>
      {/* Header: logo + pin */}
      <div
        className={cn('flex items-center transition-all duration-300', showText ? 'px-4 py-4 justify-between' : 'px-0 py-4 justify-center')}
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        {showText ? (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="flex items-center justify-center cursor-pointer select-none flex-shrink-0"
                onDoubleClick={() => window.open('https://www.wavebeiramar.com.br', '_blank')}
                title="Duplo clique para acessar wavebeiramar.com.br"
              >
                <Image src="/logos/Wave.png" alt="WAVE Beira-Mar" width={90} height={50} priority className="object-contain" style={{ width: 'auto', height: 'auto', maxWidth: 90, maxHeight: 40 }} />
              </div>
              <div className="w-px self-stretch" style={{ background: 'var(--border)' }} />
              <Image src="/logos/fip-logo.svg" alt="FIP Engenharia" width={90} height={29} priority className="object-contain flex-shrink-0" style={{ width: 'auto', height: 29 }} />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin() }}
              title={pinned ? 'Desafixar sidebar' : 'Fixar sidebar'}
              className="p-1.5 rounded-lg transition-all hidden lg:flex items-center flex-shrink-0"
              style={{ color: '#86868B' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1D1D1F'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#86868B'; e.currentTarget.style.background = '' }}
            >
              {pinned ? <PinOff className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Pin className="w-3.5 h-3.5" strokeWidth={1.5} />}
            </button>
          </>
        ) : (
          <div className="apple-icon rounded-[10px]" style={{ background: 'linear-gradient(135deg, #0071E3, #42A5F5)' }}>
            <span className="text-xs font-bold text-white">W</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 overflow-y-auto space-y-0.5">
        {mainItems.map(item => renderNavLink(item, showText))}


        {/* ── Cadastros section ── */}
        {cadastroItems.length > 0 && (
          <>
            <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />
            {!showText && <div className="my-2 mx-2 h-px" style={{ background: 'var(--border)' }} />}

            {showText ? (
              <div>
                <button
                  onClick={() => setCadastroOpen(v => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-sm font-medium transition-all duration-150 group"
                  style={{ color: isCadastroActive ? 'var(--text-1)' : 'var(--text-2)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}
                >
                  <span className="apple-icon flex-shrink-0" style={{ background: isCadastroActive ? 'linear-gradient(135deg, #64748B, #475569)' : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') }}>
                    <FolderOpen className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: isCadastroActive ? 'white' : 'var(--text-3)' }} />
                  </span>
                  <span className="flex-1 text-left">Cadastro</span>
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200')} strokeWidth={1.5} style={{ transform: cadastroOpen ? '' : 'rotate(-90deg)', color: 'var(--text-3)' }} />
                </button>
                <div className={cn('overflow-hidden transition-all duration-300 ease-in-out', cadastroOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0')}>
                  <div className="pt-0.5 ml-3 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                    {cadastroItems.map(item => renderNavLink(item, showText, true))}
                  </div>
                </div>
              </div>
            ) : (
              cadastroItems.map(item => renderNavLink(item, showText))
            )}
          </>
        )}

      </nav>

      {/* Footer */}
      <div className={cn('pt-3 pb-4 space-y-0.5', showText ? 'px-3' : 'px-2')} style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        {nomeAtual && (
          showText ? (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1 rounded-xl" style={{ background: '#F5F5F7' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-[11px]" style={{ background: 'linear-gradient(135deg, #0071E3, #42A5F5)', color: 'white' }}>
                {nomeAtual.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate" style={{ color: '#1D1D1F' }}>{nomeAtual}</p>
                <p className="text-[10px]" style={{ color: '#86868B' }}>{PERFIL_LABELS[perfilAtual]}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-white" title={nomeAtual} style={{ background: 'linear-gradient(135deg, #0071E3, #42A5F5)' }}>
                {nomeAtual.charAt(0).toUpperCase()}
              </div>
            </div>
          )
        )}

        <div className={cn('flex items-center gap-2 px-3 py-1.5', !showText && 'justify-center px-0')}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#28CD41' }} title={!showText ? 'Sistema Online' : undefined} />
          {showText && <span className="text-[11px]" style={{ color: '#86868B' }}>Online</span>}
        </div>

        <Link
          href="/logout"
          onClick={() => setMobileOpen(false)}
          title={!showText ? 'Sair do Sistema' : undefined}
          className={cn('flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150 group', !showText && 'justify-center px-0')}
          style={{ color: '#86868B' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#FF3B30'; e.currentTarget.style.background = 'rgba(255,59,48,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#86868B'; e.currentTarget.style.background = '' }}
        >
          <span className="apple-icon flex-shrink-0" style={{ background: 'rgba(255,59,48,0.08)' }}>
            <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: '#FF3B30' }} />
          </span>
          {showText && <span>Sair do Sistema</span>}
        </Link>

        {showText && (
          <div className="px-3 pt-2 pb-1 flex items-center justify-end">
            <span className="text-[10px]" style={{ color: 'var(--text-3)', opacity: 0.5 }}>v1.0.0</span>
          </div>
        )}
      </div>
    </>
  )

  // ── Bottom Navigation Bar (mobile only) ──────────────────────────────
  const bottomNavBg = isDark
    ? 'rgba(28,28,30,0.94)'
    : 'rgba(255,255,255,0.94)'
  const bottomNavBorder = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.09)'

  const BottomNav = () => (
    <nav
      className="mobile-bottom-nav fixed bottom-0 inset-x-0 z-50 lg:hidden"
      style={{
        background: bottomNavBg,
        backdropFilter: 'saturate(200%) blur(28px)',
        WebkitBackdropFilter: 'saturate(200%) blur(28px)',
        borderTop: `0.5px solid ${bottomNavBorder}`,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex items-stretch" style={{ height: 'var(--bottom-nav-h, 60px)' }}>
        {mainItems.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const colors = ICON_COLORS[item.href]
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="tap-bounce flex-1 flex flex-col items-center justify-center gap-[3px] relative"
            >
              {/* Icon container */}
              <span
                className="flex items-center justify-center transition-all duration-200"
                style={{
                  width: 36, height: 36, borderRadius: 11,
                  background: isActive && colors
                    ? `linear-gradient(135deg, ${colors.from}, ${colors.to})`
                    : 'transparent',
                  boxShadow: isActive && colors
                    ? `0 3px 10px ${colors.from}50`
                    : 'none',
                  transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
                }}
              >
                <item.icon
                  style={{
                    width: 18, height: 18,
                    color: isActive ? '#FFFFFF' : (isDark ? 'rgba(235,235,245,0.45)' : '#86868B'),
                  }}
                  strokeWidth={isActive ? 2.2 : 1.6}
                />
              </span>

              {/* Label */}
              <span
                className="text-[10px] font-medium leading-none transition-colors duration-200"
                style={{
                  color: isActive
                    ? (colors?.from ?? 'var(--accent)')
                    : (isDark ? 'rgba(235,235,245,0.45)' : '#86868B'),
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {/* Shorten long labels on mobile */}
                {item.label === 'NF Fat. Direto' ? 'Fat. Direto'
                  : item.label === 'Aprovações' ? 'Aprovações'
                  : item.label}
              </span>

              {/* Pending badge */}
              {'badge' in item && item.badge && !isActive && (
                <span
                  className="absolute top-1 right-[22%] w-2 h-2 rounded-full"
                  style={{ background: '#0071E3', boxShadow: '0 0 0 1.5px white' }}
                />
              )}
            </Link>
          )
        })}

        {/* "Mais" — opens the slide-over drawer for secondary nav items */}
        <button
          onClick={() => setMobileOpen(true)}
          className="tap-bounce flex-1 flex flex-col items-center justify-center gap-[3px]"
        >
          <span
            className="flex items-center justify-center"
            style={{ width: 36, height: 36, borderRadius: 11 }}
          >
            <MoreHorizontal
              style={{
                width: 18, height: 18,
                color: isDark ? 'rgba(235,235,245,0.45)' : '#86868B',
              }}
              strokeWidth={1.6}
            />
          </span>
          <span
            className="text-[10px] leading-none"
            style={{ color: isDark ? 'rgba(235,235,245,0.45)' : '#86868B' }}
          >
            Mais
          </span>
        </button>
      </div>
    </nav>
  )

  return (
    <>
      {/* ── Mobile: slide-over drawer (secondary items / Cadastro) ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 flex flex-col lg:hidden overflow-hidden',
          'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
        style={{
          background: isDark ? '#1C1C1E' : '#FFFFFF',
          borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: 'var(--text-3)' }}
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
        {renderContent(true)}
      </aside>

      {/* ── Desktop: collapsible side rail ── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex-col overflow-hidden hidden lg:flex',
          'transition-all duration-300 ease-in-out',
          expanded ? 'w-64' : 'w-14',
          !pinned && expanded && 'shadow-2xl',
        )}
        style={{ background: isDark ? '#1C1C1E' : '#FFFFFF', borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {renderContent(expanded)}
      </aside>

      {/* ── Mobile Bottom Navigation ── */}
      <BottomNav />
    </>
  )
}
