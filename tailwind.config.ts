import type { Config } from 'tailwindcss'

/**
 * Paleta extraída 1:1 do protótipo aprovado (legacy/index.html):
 *   --brand-500 #8A2A41 (vinho/bordô) · --gold-500 #E0B252 (dourado)
 *   --bg #F7F5FB · --text #2E2140 · --border #ECE6F5 · theme #230A10
 * Fontes: Inter (texto) + Playfair Display (títulos).
 */
const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#FBF4F6',
          100: '#F6E7EB',
          200: '#E9C7D0',
          300: '#CE8E9C',
          400: '#A8455C',
          500: '#8A2A41', // primária  botões / acentos
          600: '#6E2032', // ativa  sidebar selecionada
          700: '#571826',
          800: '#3F1119',
          900: '#230A10', // theme-color / topo
        },
        gold: {
          300: '#F0D89A',
          400: '#E9C46A',
          500: '#E0B252',
          600: '#C79433',
          700: '#9E7322',
        },
        ink: '#2E2140',
        line: '#ECE6F5',
        canvas: '#F7F5FB',
        ok: '#1F9D6B',
        danger: '#D85563',
        warn: '#E0922A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-in-right': 'slideInRight 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
