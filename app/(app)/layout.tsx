import { Sidebar } from '@/components/layout/sidebar'
import { CommandPalette } from '@/components/ui/command-palette'
import { getPerfilDoUsuarioLogado } from '@/lib/db/usuarios'
import { getPermissoesDoUsuarioLogado } from '@/lib/db/permissoes'
import { PermissoesProvider } from '@/lib/context/permissoes-context'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [perfil, permissoes] = await Promise.all([
    getPerfilDoUsuarioLogado().catch(() => null),
    getPermissoesDoUsuarioLogado().catch(() => []),
  ])

  return (
    <PermissoesProvider permissoes={permissoes}>
      <div className="flex min-h-screen overflow-x-hidden">
        <Sidebar perfilAtual={perfil?.perfil ?? 'visualizador'} nomeAtual={perfil?.nome ?? ''} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
        <CommandPalette />
      </div>
    </PermissoesProvider>
  )
}
