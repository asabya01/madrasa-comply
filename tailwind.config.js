/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        outstanding: '#437a22',
        good: '#006494',
        satisfactory: '#d19900',
        unsatisfactory: '#da7101',
        nui: '#a12c7b',
        primary: {
          DEFAULT: '#01696f',
          hover: '#0c4e54',
        },
        bg: '#f7f6f2',
        surface: '#ffffff',
        muted: '#6b7280',
      },
      fontFamily: {
        sans: ['Satoshi', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
