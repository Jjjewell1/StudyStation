import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'

// Dev-only mock API so the dashboard renders before the real backend exists.
// In production, nginx serves static files and proxies /api to the backend.
function mockApi() {
  return {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        const url = new URL(req.url, 'http://localhost')
        const path = url.pathname.replace(/^\/api\/?/, '')
        const mockDir = fileURLToPath(new URL('./src/dev-mock', import.meta.url))
        const file = `${mockDir}/${path || 'index'}.json`
        if (existsSync(file)) {
          res.end(readFileSync(file, 'utf-8'))
        } else {
          res.statusCode = 404
          res.end(JSON.stringify({ error: `no mock for /api/${path}` }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
