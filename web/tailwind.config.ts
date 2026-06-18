import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cf: {
          orange: '#f97316',
          blue: '#6366f1',
          dark: '#09090b',
        },
        surface: {
          DEFAULT: '#18181b',
          raised: '#27272a',
          overlay: '#09090b',
        },
      },
      boxShadow: {
        'glow-orange': '0 0 20px 0 rgba(249,115,22,0.25)',
        'glow-green': '0 0 16px 0 rgba(16,185,129,0.2)',
        'card': '0 1px 3px 0 rgba(0,0,0,0.5), 0 1px 2px -1px rgba(0,0,0,0.5)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.15s ease-out both',
        'slide-up': 'slide-up 0.2s ease-out both',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config
