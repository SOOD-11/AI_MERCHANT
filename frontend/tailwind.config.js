/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        knit: {
          bg: '#0D0B0A',
          card: '#191513',
          cardLight: '#241E1B',
          border: '#332B25',
          text: '#EDE5DE',
          muted: '#8C7A6B',
          oatmeal: '#D9C3B0',
          coffee: '#594436',
        },
      },
    },
  },
  plugins: [],
}