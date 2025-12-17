import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cyberpunk: {
          black: '#000000',
          cyan: '#00D9FF',
          blue: '#0080FF',
          purple: '#7000FF',
          pink: '#FF0080',
        }
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      boxShadow: {
        neon: '0 0 10px rgba(0, 217, 255, 0.5)',
        'neon-lg': '0 0 20px rgba(0, 217, 255, 0.7)',
      }
    },
  },
  plugins: [],
}
export default config
