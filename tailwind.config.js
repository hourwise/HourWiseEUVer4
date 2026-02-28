// tailwind.config.js
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./screens/**/*.{js,jsx,ts,tsx}",
    "./navigation/**/*.{js,jsx,ts,tsx}",
    "./hooks/**/*.{js,jsx,ts,tsx}",
    "./providers/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Main Branding & Backgrounds
        brand: {
          dark: '#020617',     // Deepest Navy for backgrounds
          card: '#0F172A',     // Slate for UI Cards
          border: '#1E293B',   // Subtle borders
          accent: '#F59E0B',   // Safety Orange
        },
        // Compliance Signaling (Traffic Light System)
        compliance: {
          success: '#10B981',  // Emerald Green (Safe/Resting)
          warning: '#FACC15',  // Amber/Yellow (Approaching Limit)
          danger: '#F43F5E',   // Vivid Rose/Red (Violation/Critical)
          info: '#38BDF8',     // Sky Blue (POA/Information)
        },
        // Typography
        slate: {
          50: '#F8FAFC',       // Primary Text
          400: '#94A3B8',      // Dimmed/Secondary Text
        }
      },
      // Temporarily removed fontFamily to fix Metro server timeout
      // fontFamily: {
      //   timer: ['RobotoMono-Bold', 'monospace'], 
      //   sans: ['Inter-Regular', 'system-ui'],
      // },
    },
  },
  plugins: [],
}
