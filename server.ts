import 'dotenv/config'
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json({ limit: '10mb' }))

// Dynamically load API routes
const routes = ['analyze', 'fetch-rss', 'analyst', 'polymarket', 'chat']
for (const route of routes) {
  const mod = await import(`./api/${route}.ts`)
  app.all(`/api/${route}`, mod.default)
  console.log(`Registered /api/${route}`)
}

// Serve built frontend
app.use(express.static(path.join(__dirname, 'dist')))
app.get('/{*path}', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')))

const PORT = 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))
