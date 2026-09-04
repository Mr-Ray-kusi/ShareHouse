/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#eaf6ef',
          100: '#ccead8',
          200: '#9dd4b4',
          300: '#63b888',
          400: '#2e9660',
          500: '#147a48',
          600: '#0b5d3b',
          700: '#08472d',
          800: '#063522',
          900: '#042418',
        },
        gold: {
          400: '#f0c44a',
          500: '#d4a017',
          600: '#b8860b',
        },
        ink: '#12241c',
        cream: '#f4efe4',
        mist: '#e8f0ea',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Outfit', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        lift: '0 24px 50px -28px rgba(6, 53, 34, 0.45)',
        desk: '0 18px 40px -24px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};
