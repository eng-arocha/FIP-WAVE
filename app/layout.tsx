import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ThemeProvider } from '@/components/ui/theme-provider'

export const metadata: Metadata = {
  title: 'FIP-WAVE · Controle de Medições',
  description: 'Sistema de Controle de Medições e Faturamento de Contratos',
  manifest: '/manifest.json',
  applicationName: 'FIP-WAVE',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: 'FIP-WAVE', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F5F7' },
    { media: '(prefers-color-scheme: dark)',  color: '#1C1C1E' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="min-h-full dark" suppressHydrationWarning>
      {/* Prevent flash of wrong theme — runs before React hydration */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('fip-theme');var d=document.documentElement;if(t==='light'){d.classList.remove('dark');d.classList.add('light');}else{d.classList.add('dark');d.classList.remove('light');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
