import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  base: process.env.CF_PAGES ? '/' : '/threatbase/',
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 9999,
  },
})