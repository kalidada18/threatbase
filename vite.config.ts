import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 9999,
  },
  build: {
    rollupOptions: {
      output: {
        // Stable vendor split: app edits no longer invalidate react/motion,
        // and motion updates don't invalidate react. Returning visitors
        // re-download only the chunk that actually changed.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          if (/[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion-vendor'
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase-vendor'
        },
      },
    },
  },
})