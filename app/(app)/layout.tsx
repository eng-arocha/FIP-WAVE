import { SidebarShell } from '@/components/layout/sidebar-shell'
import { CommandPalette } from '@/components/ui/command-palette'
import { EscBack } from '@/components/ui/esc-back'
import { ForcePasswordChangeGate } from '@/components/auth/force-password-change-gate'
import { getPerfilDoUsuarioLogado } from '@/lib/db/usuarios'
import { getPermissoesDoUsuarioLogado } from '@/lib/db/permissoes'
import { PermissoesProvider } from '@/lib/context/permissoes-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [perfil, permissoesEfetivas] = await Promise.all([
    getPerfilDoUsuarioLogado().catch(() => null),
    // Já aplica a lógica nova (admin → tudo, customizado → ilha, senão → template)
    getPermissoesDoUsuarioLogado().catch(() => []),
  ])

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
