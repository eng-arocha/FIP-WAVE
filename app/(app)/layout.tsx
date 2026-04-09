import { SidebarShell } from '@/components/layout/sidebar-shell'
import { CommandPalette } from '@/components/ui/command-palette'
import { EscBack } from '@/components/ui/esc-back'
import { ForcePasswordChangeGate } from '@/components/auth/force-password-change-gate'
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
  const deveTrocarSenha = (perfil as any)?.deve_trocar_senha === true

  return (
    <PermissoesProvider permissoes={permissoesEfetivas} perfilAtual={perfil?.perfil ?? 'visualizador'}>
      <ForcePasswordChangeGate deveTrocarSenha={deveTrocarSenha}>
        <SidebarShell
          perfilAtual={perfil?.perfil ?? 'visualizador'}
          nomeAtual={perfil?.nome ?? ''}
        >
          <EscBack />
          {children}
          <CommandPalette />
        </SidebarShell>
      </ForcePasswordChangeGate>
    </PermissoesProvider>
  )
}
