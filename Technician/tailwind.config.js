/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
      },
      colors: {
        navy: { DEFAULT: '#0B1F3A', 900: '#081628', 800: '#0F2647', 700: '#16335E', 600: '#1E4178' },
        brand: { 50: '#ecfdfa', 100: '#d0f7f0', 200: '#a5ede1', 300: '#6dddcd', 400: '#34c4b3', 500: '#0EA99A', 600: '#0a8579', 700: '#0c6a61', 800: '#0e554f', 900: '#0f4742' },
        gold: { 400: '#eec256', 500: '#E0A82E', 600: '#c8901a' },
        ink: '#0f1b2d',
        muted: '#64748b',
      },
      boxShadow: { card: '0 1px 3px rgba(15,27,45,.06), 0 8px 24px -12px rgba(15,27,45,.12)', soft: '0 2px 12px rgba(15,27,45,.05)', glow: '0 8px 30px -8px rgba(14,169,154,.45)' },
      borderRadius: { xl: '14px', '2xl': '18px' },
      keyframes: { 'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } } },
      animation: { 'fade-up': 'fade-up .35s ease both' },
    },
  },
  plugins: [],
}
