import { SidebarShell } from '@/components/layout/sidebar-shell'
import { CommandPalette } from '@/components/ui/command-palette'
import { EscBack } from '@/components/ui/esc-back'
import { getPerfilDoUsuarioLogado } from '@/lib/db/usuarios'
import { getPermissoesDoUsuarioLogado } from '@/lib/db/permissoes'
import { PermissoesProvider } from '@/lib/context/permissoes-context'
import { TEMPLATES } from '@/lib/permissoes-config'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [perfil, permissoes] = await Promise.all([
    getPerfilDoUsuarioLogado().catch(() => null),
    getPermissoesDoUsuarioLogado().catch(() => []),
  ])

  const perfilKey = (perfil?.perfil ?? 'visualizador') as keyof typeof TEMPLATES
  const permissoesEfetivas = permissoes.length > 0 ? permissoes : (TEMPLATES[perfilKey] ?? TEMPLATES.visualizador)

  return (
    <PermissoesProvider permissoes={permissoesEfetivas}>
      <SidebarShell
        perfilAtual={perfil?.perfil ?? 'visualizador'}
        nomeAtual={perfil?.nome ?? ''}
      >
        <EscBack />
        {children}
        <CommandPalette />
      </SidebarShell>
    </PermissoesProvider>
  )
}
