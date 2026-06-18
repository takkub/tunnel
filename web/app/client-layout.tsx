'use client'

import { usePathname } from 'next/navigation'

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconGlobe({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}

function IconTerminal({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  )
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

const navItems = [
  { href: '/', label: 'Tunnels', Icon: IconHome },
  { href: '/dns', label: 'DNS', Icon: IconGlobe },
  { href: '/logs', label: 'Logs', Icon: IconTerminal },
  { href: '/settings', label: 'Settings', Icon: IconSettings },
]

const pageTitles: Record<string, string> = {
  '/': 'Tunnel Manager',
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
      <header className="sticky top-0 z-50 h-14 flex items-center px-4 gap-3"
        style={{ background: 'rgba(9,9,11,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #27272a' }}>
        <div className="flex items-center gap-2.5 flex-1">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shadow-glow-orange flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
              <circle cx="12" cy="12" r="9" />
              <path d="M3.6 9h16.8M3.6 15h16.8" />
              <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z" />
            </svg>
          </div>
          <span className="font-semibold text-zinc-100 text-base tracking-tight">{title}</span>
        </div>
      </header>

      <main className="p-4 pb-24">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex w-full"
        style={{
          background: 'rgba(9,9,11,0.92)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid #27272a',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <a
              key={href}
              href={href}
              className={`relative flex flex-col items-center justify-center flex-1 py-2.5 gap-1 text-xs font-medium transition-all duration-150 ${
                active ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300 active:text-zinc-200'
              }`}
            >
              <Icon className={`w-5 h-5 transition-all duration-150 ${active ? 'stroke-orange-400' : ''}`} />
              <span className="leading-none">{label}</span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-orange-400 rounded-full" />
              )}
            </a>
          )
        })}
      </nav>
    </>
  )
}
