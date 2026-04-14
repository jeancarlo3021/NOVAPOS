/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          400: '#34d399',
          500: '#10b981', // Verde Esmeralda principal
          600: '#059669',
          700: '#047857',
        },
        dark: {
          800: '#1e293b',
          900: '#0f172a', // Pizarra oscuro para el Sidebar
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
