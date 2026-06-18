import type { Metadata } from 'next'
import './globals.css'
import { ClientLayout } from './client-layout'

export const metadata: Metadata = {
  title: 'Cloudflare Tunnel Manager',
  description: 'จัดการ Cloudflare Tunnels',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="bg-gray-950 text-white min-h-screen">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
