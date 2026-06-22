import type { Metadata, Viewport } from 'next'
import './globals.css'
import '@tabler/icons-webfont/tabler-icons.min.css'
import '@/styles/legacy.css'
import '@/styles/overrides.css'

export const metadata: Metadata = {
  title: 'Laser&Co Power System',
  description: 'Sistema de gestão da rede de franquias Laser&Co',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Laser&Co',
  },
}

export const viewport: Viewport = {
  themeColor: '#230A10',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Mesmas fontes do protótipo (Inter + Playfair Display) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
