import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// Preview harness: το Statistics.jsx τρέχει με ψεύτικη supabase (4700 γραμμές)
// ώστε να φαίνεται η σελιδοποίηση χωρίς login. ΔΕΝ αφορά την παραγωγή.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [{ find: /^\.\/supabaseClient$/, replacement: path.resolve('./preview/mockSupabase.js') }],
  },
  server: { port: 5199 },
})
