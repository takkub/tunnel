'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

function IconTunnel({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8" />
      <path d="M12 3a14 14 0 014 9 14 14 0 01-4 9 14 14 0 01-4-9 14 14 0 014-9z" />
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

function IconMenu({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconServer({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  )
}

function IconDocker({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="5" height="4" rx="1" />
      <rect x="8" y="7" width="5" height="4" rx="1" />
      <rect x="14" y="7" width="5" height="4" rx="1" />
      <rect x="8" y="2" width="5" height="4" rx="1" />
      <path d="M2 15c0 2.2 1.8 4 4 4h12a4 4 0 004-4v-2H2v2z" />
    </svg>
  )
}

const navItems = [
  { href: '/', label: 'Tunnels', Icon: IconTunnel },
  { href: '/nginx', label: 'Nginx', Icon: IconServer },
  { href: '/docker', label: 'Docker', Icon: IconDocker },
  { href: '/settings', label: 'Settings', Icon: IconSettings },
]

const pageTitles: Record<string, string> = {
  '/': 'Tunnels',
  '/nginx': 'Nginx Reverse Proxy',
  '/docker': 'Docker',
  '/settings': 'Settings',
  '/setup': 'Setup',
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const title = pageTitles[pathname] ?? 'Tunnel Manager'
  const toggleBtnRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (!sidebarOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [sidebarOpen])

  useEffect(() => {
    if (sidebarOpen) {
      wasOpenRef.current = true
      const first = sidebarRef.current?.querySelector<HTMLElement>(
        'a, button, [tabindex]:not([tabindex="-1"])'
      )
      first?.focus()
    } else if (wasOpenRef.current) {
      toggleBtnRef.current?.focus()
    }
  }, [sidebarOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Mobile: fixed toggle button — always accessible regardless of scroll position */}
      <button
        ref={toggleBtnRef}
        onClick={() => setSidebarOpen(v => !v)}
        className="fixed top-3 left-3 z-[60] lg:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors shadow-md backdrop-blur-sm"
        aria-label="Toggle sidebar"
        aria-expanded={sidebarOpen}
        aria-controls="sidebar-nav"
      >
        <IconMenu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-200 ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside id="sidebar-nav" ref={sidebarRef} className={`fixed inset-y-0 left-0 z-50 w-56 flex flex-col border-r border-zinc-800/60 transition-transform duration-200 lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: '#0c0c0e' }}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 gap-3 border-b border-zinc-800/60 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center shadow-glow-orange flex-shrink-0">
            <IconTunnel className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-zinc-100 text-sm tracking-tight">Tunnel Manager</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center px-4 gap-3 border-b border-zinc-800/60 shrink-0 lg:px-4 pl-14 lg:pl-4"
          style={{ background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(8px)' }}>
          <h1 className="text-sm font-semibold text-zinc-200">{title}</h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  )
}
