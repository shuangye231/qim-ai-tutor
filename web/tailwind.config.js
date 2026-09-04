/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#2563EB',
        'brand-hover': '#1D4ED8',
        'brand-soft': '#EAF1FF',
        ink: '#18212C',
        muted: '#667085',
        canvas: '#F5F7FA',
        line: '#E4E8EE',
      },
      fontFamily: {
        sans: ['Microsoft YaHei UI', 'Microsoft YaHei', 'Segoe UI Variable', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
