import type { Metadata, Viewport } from 'next'
import { Playfair_Display, Dancing_Script, Inter } from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  weight: '700',
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
})

const dancing = Dancing_Script({
  weight: ['400', '600'],
  subsets: ['latin'],
  variable: '--font-dancing',
  display: 'swap',
})

const inter = Inter({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HRINI',
  description: 'Two hearts, one app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'HRINI',
  },
}

export const viewport: Viewport = {
  themeColor: '#1C1917',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${dancing.variable} ${inter.variable} h-full`}
      style={{ background: '#1C1917' }}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body
        className="min-h-full flex flex-col antialiased"
        style={{ backgroundColor: '#1C1917', color: '#F5F0E8', fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)' }}
      >
        {children}
      </body>
    </html>
  )
}
