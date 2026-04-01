import { Sidebar } from '@/components/layout/sidebar'
import { CommandPalette } from '@/components/ui/command-palette'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
      <CommandPalette />
    </div>
  )
}
