import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ui/theme-provider'

export const metadata: Metadata = {
  title: 'FIP-WAVE · Controle de Medições',
  description: 'Sistema de Controle de Medições e Faturamento de Contratos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full dark" suppressHydrationWarning>
      {/* Prevent flash of wrong theme — runs before React hydration */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('fip-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark');d.classList.add('light');}else{d.classList.add('dark');d.classList.remove('light');}})();`,
          }}
        />
      </head>
      <body className="h-full antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
