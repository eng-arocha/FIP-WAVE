import { Sidebar } from '@/components/layout/sidebar'
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

  // Se o usuário não tem permissões salvas ainda, usa o template do seu perfil como fallback
  const perfilKey = (perfil?.perfil ?? 'visualizador') as keyof typeof TEMPLATES
  const permissoesEfetivas = permissoes.length > 0 ? permissoes : (TEMPLATES[perfilKey] ?? TEMPLATES.visualizador)

  return (
    <PermissoesProvider permissoes={permissoesEfetivas}>
      <div className="flex min-h-screen overflow-x-hidden">
        <Sidebar perfilAtual={perfil?.perfil ?? 'visualizador'} nomeAtual={perfil?.nome ?? ''} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <EscBack />
          {children}
        </main>
        <CommandPalette />
      </div>
    </PermissoesProvider>
  )
}
