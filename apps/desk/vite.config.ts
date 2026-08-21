import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: '../../packages/dsh-forge-web/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3080',
        ws: true,
      },
      '/forge': {
        target: 'http://127.0.0.1:3080',
      },
    },
  },
})
