'use client'

import { usePathname } from 'next/navigation'

const navItems = [
  { href: '/', label: 'Dashboard', icon: '🏠' },
  { href: '/dns', label: 'DNS', icon: '🌐' },
  { href: '/logs', label: 'Logs', icon: '📋' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
]

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/dns': 'DNS',
  '/logs': 'Logs',
  '/settings': 'Settings',
  '/setup': 'Setup',
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const title = pageTitles[pathname] ?? 'Tunnel Manager'

  return (
    <>
      <header className="sticky top-0 z-50 bg-gray-900 border-b border-gray-800 h-14 flex items-center px-4 gap-3">
        <span className="text-orange-400 text-2xl leading-none">☁</span>
        <span className="font-semibold text-white text-base tracking-wide">{title}</span>
      </header>

      <main className="p-4 pb-24">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 flex w-full"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {navItems.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <a
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-xs transition-colors ${
                active ? 'text-orange-400' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span className="text-2xl leading-none">{icon}</span>
              <span className="font-medium">{label}</span>
            </a>
          )
        })}
      </nav>
    </>
  )
}
