import type { Metadata } from 'next'
import { Inter, Noto_Sans_Thai } from 'next/font/google'
import './globals.css'
import { ClientLayout } from './client-layout'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const notoThai = Noto_Sans_Thai({
  subsets: ['thai'],
  variable: '--font-noto-thai',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Cloudflare Tunnel Manager',
  description: 'จัดการ Cloudflare Tunnels',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
