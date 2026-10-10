/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gnss: {
          dark: '#0f172a',
          panel: '#1e293b',
          border: '#334155',
          fix: '#10b981',    // Emerald green for RTK Fix
          float: '#f59e0b',  // Amber yellow for RTK Float
          single: '#ef4444', // Red for Single
          dgps: '#3b82f6',   // Blue for DGPS
          hud: '#050b14'
        }
      }
    },
  },
  plugins: [],
}
