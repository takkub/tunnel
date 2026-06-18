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
          orange: '#F48120',
          blue: '#1B6CE1',
          dark: '#1C1C1C',
        },
      },
    },
  },
  plugins: [],
}
export default config
